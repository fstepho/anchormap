import { cpus, release, tmpdir, totalmem } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
	mkdirSync,
} from "node:fs"
import { spawnSync } from "node:child_process"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const manifestPath = join(repoRoot, "bench", "corpora", "v1", "corpora.json")
const defaultReportDir = join(repoRoot, "bench", "reports")
const cliPath = join(repoRoot, "bin", "anchormap")
const releaseNodeFlags = [
	"--no-opt",
	"--max-semi-space-size=1",
	"--no-expose-wasm",
]
const supportedPlatformKeys = new Set(["darwin:arm64", "linux:x64"])

class BenchmarkFailure extends Error {
	constructor(message) {
		super(message)
		this.name = "BenchmarkFailure"
	}
}

function fail(message) {
	throw new BenchmarkFailure(message)
}

function parseArgs(argv) {
	const options = {
		corpus: "all",
		warmups: 5,
		runs: 30,
		outDir: defaultReportDir,
		keepTemp: false,
		allowIncompleteProtocol: false,
	}

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		if (arg === "--corpus") {
			options.corpus = requireValue(argv, index, arg)
			index += 1
			continue
		}
		if (arg === "--warmups") {
			options.warmups = parsePositiveInteger(requireValue(argv, index, arg), arg)
			index += 1
			continue
		}
		if (arg === "--runs") {
			options.runs = parsePositiveInteger(requireValue(argv, index, arg), arg)
			index += 1
			continue
		}
		if (arg === "--out-dir") {
			options.outDir = resolve(requireValue(argv, index, arg))
			index += 1
			continue
		}
		if (arg === "--keep-temp") {
			options.keepTemp = true
			continue
		}
		if (arg === "--allow-incomplete-protocol") {
			options.allowIncompleteProtocol = true
			continue
		}
		fail(`benchmark: invalid argument ${arg}`)
	}

	return options
}

function requireValue(argv, index, flag) {
	const value = argv[index + 1]
	if (value === undefined || value.startsWith("--")) {
		fail(`benchmark: ${flag} requires a value`)
	}
	return value
}

function parsePositiveInteger(value, flag) {
	if (!/^[0-9]+$/.test(value)) {
		fail(`benchmark: ${flag} must be a positive integer`)
	}
	const parsed = Number(value)
	if (!Number.isSafeInteger(parsed) || parsed < 1) {
		fail(`benchmark: ${flag} must be a positive integer`)
	}
	return parsed
}

function readManifest() {
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
	if (manifest.schema_version !== 1 || typeof manifest.corpus_version !== "string") {
		fail("benchmark: invalid corpus manifest header")
	}
	if (!Array.isArray(manifest.corpora)) {
		fail("benchmark: invalid corpus manifest corpora")
	}
	for (const corpus of manifest.corpora) {
		validateCorpusDefinition(corpus)
	}
	return manifest
}

function validateCorpusDefinition(corpus) {
	for (const key of ["id", "product_files", "observed_anchors", "mapped_anchors", "supported_edges"]) {
		if (corpus[key] === undefined) {
			fail(`benchmark: corpus missing ${key}`)
		}
	}
	if (!["small", "medium", "large"].includes(corpus.id)) {
		fail(`benchmark: unsupported corpus id ${corpus.id}`)
	}
	if (corpus.product_files % corpus.mapped_anchors !== 0) {
		fail(`benchmark: corpus ${corpus.id} product_files must divide mapped_anchors`)
	}
	const groupSize = corpus.product_files / corpus.mapped_anchors
	const maximumEdges = corpus.mapped_anchors * groupSize * (groupSize - 1)
	if (corpus.supported_edges > maximumEdges) {
		fail(`benchmark: corpus ${corpus.id} cannot materialize requested supported_edges`)
	}
	if (corpus.gate === true) {
		if (
			typeof corpus.p95_wall_clock_ms_budget !== "number" ||
			typeof corpus.peak_rss_mib_budget !== "number"
		) {
			fail(`benchmark: gated corpus ${corpus.id} is missing budgets`)
		}
	}
}

function selectCorpora(manifest, selectedId) {
	if (selectedId === "all") {
		return manifest.corpora
	}
	const selected = manifest.corpora.find((corpus) => corpus.id === selectedId)
	if (selected === undefined) {
		fail(`benchmark: unknown corpus ${selectedId}`)
	}
	return [selected]
}

function materializeCorpus(corpus) {
	const tempRoot = mkdtempSync(join(tmpdir(), `anchormap-bench-${corpus.id}-`))
	const productRoot = join(tempRoot, "src")
	const specRoot = join(tempRoot, "docs", "specs")
	mkdirSync(productRoot, { recursive: true })
	mkdirSync(specRoot, { recursive: true })

	const edgesByFile = buildEdges(corpus)
	for (let index = 0; index < corpus.product_files; index += 1) {
		const fileName = productFileName(index)
		const imports = edgesByFile.get(index) ?? []
		writeFileSync(join(productRoot, fileName), renderProductFile(index, imports), "utf8")
	}

	writeFileSync(join(specRoot, "anchors.md"), renderSpecFile(corpus), "utf8")
	writeFileSync(join(tempRoot, "anchormap.yaml"), renderConfigFile(corpus), "utf8")

	return tempRoot
}

function buildEdges(corpus) {
	const edgesByFile = new Map()
	const groupSize = corpus.product_files / corpus.mapped_anchors
	const edgesPerGroupBase = Math.floor(corpus.supported_edges / corpus.mapped_anchors)
	let remainder = corpus.supported_edges % corpus.mapped_anchors
	let totalEdges = 0

	for (let group = 0; group < corpus.mapped_anchors; group += 1) {
		const groupStart = group * groupSize
		const targetEdges = edgesPerGroupBase + (remainder > 0 ? 1 : 0)
		remainder -= remainder > 0 ? 1 : 0
		let groupEdges = 0

		for (let distance = 1; distance < groupSize && groupEdges < targetEdges; distance += 1) {
			for (let offset = 0; offset < groupSize && groupEdges < targetEdges; offset += 1) {
				const importer = groupStart + offset
				const target = groupStart + ((offset + distance) % groupSize)
				const targets = edgesByFile.get(importer) ?? []
				targets.push(target)
				edgesByFile.set(importer, targets)
				groupEdges += 1
				totalEdges += 1
			}
		}
	}

	if (totalEdges !== corpus.supported_edges) {
		fail(`benchmark: corpus ${corpus.id} generated ${totalEdges} supported edges`)
	}

	return edgesByFile
}

function renderProductFile(index, imports) {
	const lines = []
	for (const target of imports) {
		lines.push(
			`import { value${paddedNumber(target)} as dep${paddedNumber(target)} } from "./${productModuleName(target)}";`,
		)
	}
	lines.push("")
	lines.push(`export const value${paddedNumber(index)} = ${index};`)
	if (imports.length > 0) {
		lines.push(
			`export const linked${paddedNumber(index)} = [${imports
				.map((target) => `dep${paddedNumber(target)}`)
				.join(", ")}];`,
		)
	}
	return `${lines.join("\n")}\n`
}

function renderSpecFile(corpus) {
	const lines = []
	for (let index = 0; index < corpus.observed_anchors; index += 1) {
		lines.push(`# ${anchorId(index)} Benchmark anchor ${index}`)
		lines.push("")
	}
	return lines.join("\n")
}

function renderConfigFile(corpus) {
	const lines = [
		"version: 1",
		"product_root: src",
		"spec_roots:",
		"  - docs/specs",
		"ignore_roots: []",
		"mappings:",
	]
	const groupSize = corpus.product_files / corpus.mapped_anchors
	for (let index = 0; index < corpus.mapped_anchors; index += 1) {
		lines.push(`  ${anchorId(index)}:`)
		lines.push("    seed_files:")
		lines.push(`      - src/${productFileName(index * groupSize)}`)
	}
	return `${lines.join("\n")}\n`
}

function productFileName(index) {
	return `${productModuleName(index)}.ts`
}

function productModuleName(index) {
	return `file-${paddedNumber(index)}`
}

function paddedNumber(index) {
	return String(index).padStart(4, "0")
}

function anchorId(index) {
	return `PERF-${String(index).padStart(3, "0")}`
}

function runMeasuredProcess(cwd) {
	const timeArgs = timeCommandArgs()
	const started = process.hrtime.bigint()
	const result = spawnSync(timeArgs.command, [...timeArgs.args, cliPath, "scan", "--json"], {
		cwd,
		env: measuredProcessEnv(),
		encoding: "utf8",
		stdio: ["ignore", "ignore", "pipe"],
		maxBuffer: 1024 * 1024 * 256,
	})
	const ended = process.hrtime.bigint()
	const wallClockMs = Number(ended - started) / 1_000_000

	if (result.error !== undefined) {
		fail(`benchmark: failed to execute ${timeArgs.command}: ${result.error.message}`)
	}
	if (result.status !== 0) {
		fail(`benchmark: CLI exited ${result.status}\n${tail(result.stderr ?? "")}`)
	}

	return {
		wall_clock_ms: round(wallClockMs, 3),
		peak_rss_mib: parsePeakRssMib(result.stderr ?? ""),
		exit_code: result.status,
	}
}

function assertMeasurementEnvironment() {
	if (process.env.NODE_OPTIONS !== undefined && process.env.NODE_OPTIONS !== "") {
		fail("benchmark: NODE_OPTIONS must be unset for release benchmark measurement")
	}
}

function measuredProcessEnv() {
	const { NODE_OPTIONS: _nodeOptions, ...env } = process.env
	return env
}

function timeCommandArgs() {
	if (process.platform === "darwin") {
		return { command: "/usr/bin/time", args: ["-l"] }
	}
	if (process.platform === "linux") {
		return { command: "/usr/bin/time", args: ["-v"] }
	}
	fail(`benchmark: unsupported benchmark platform ${process.platform}:${process.arch}`)
}

function parsePeakRssMib(stderr) {
	const linuxMatch = /Maximum resident set size \(kbytes\):\s*([0-9]+)/.exec(stderr)
	if (linuxMatch !== null) {
		return round(Number(linuxMatch[1]) / 1024, 3)
	}

	const darwinMatch = /([0-9]+)\s+maximum resident set size/.exec(stderr)
	if (darwinMatch !== null) {
		return round(Number(darwinMatch[1]) / 1024 / 1024, 3)
	}

	fail(`benchmark: could not parse peak RSS from /usr/bin/time output\n${tail(stderr)}`)
}

function p95(values) {
	const sorted = [...values].sort((left, right) => left - right)
	const index = Math.ceil(sorted.length * 0.95) - 1
	return sorted[Math.max(0, Math.min(index, sorted.length - 1))]
}

function round(value, digits) {
	const factor = 10 ** digits
	return Math.round(value * factor) / factor
}

function tail(text) {
	return text.split(/\r?\n/).slice(-20).join("\n")
}

function npmVersion() {
	const result = spawnSync("npm", ["--version"], {
		cwd: repoRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	})
	if (result.status !== 0) {
		return "unavailable"
	}
	return result.stdout.trim()
}

function referenceMachine() {
	const cpuList = cpus()
	const platformKey = `${process.platform}:${process.arch}`
	return {
		platform: process.platform,
		arch: process.arch,
		supported_platform: supportedPlatformKeys.has(platformKey),
		os_release: release(),
		cpu_model: cpuList[0]?.model ?? "unknown",
		cpu_count: cpuList.length,
		total_memory_mib: Math.round(totalmem() / 1024 / 1024),
		node_version: process.version,
		npm_version: npmVersion(),
	}
}

function benchmarkCorpus(corpus, options) {
	const corpusDir = materializeCorpus(corpus)
	const warmups = []
	const measured = []

	try {
		for (let index = 0; index < options.warmups; index += 1) {
			warmups.push(runMeasuredProcess(corpusDir))
		}
		for (let index = 0; index < options.runs; index += 1) {
			measured.push(runMeasuredProcess(corpusDir))
		}
	} finally {
		if (!options.keepTemp) {
			rmSync(corpusDir, { recursive: true, force: true })
		}
	}

	const p95WallClockMs = p95(measured.map((run) => run.wall_clock_ms))
	const peakRssMib = Math.max(...measured.map((run) => run.peak_rss_mib))
	const budgetVerdict =
		corpus.gate === true
			? p95WallClockMs <= corpus.p95_wall_clock_ms_budget &&
				peakRssMib <= corpus.peak_rss_mib_budget
				? "pass"
				: "fail"
			: "informational"

	return {
		corpus_id: corpus.id,
		product_files: corpus.product_files,
		observed_anchors: corpus.observed_anchors,
		mapped_anchors: corpus.mapped_anchors,
		supported_edges: corpus.supported_edges,
		gate: corpus.gate,
		budgets:
			corpus.gate === true
				? {
						p95_wall_clock_ms: corpus.p95_wall_clock_ms_budget,
						peak_rss_mib: corpus.peak_rss_mib_budget,
					}
				: null,
		warmup_runs: warmups,
		measured_runs: measured,
		p95_wall_clock_ms: round(p95WallClockMs, 3),
		peak_rss_mib: round(peakRssMib, 3),
		verdict: budgetVerdict,
	}
}

function createReport(manifest, results, options) {
	const machine = referenceMachine()
	const protocolCompliant =
		options.warmups === 5 &&
		options.runs === 30 &&
		results.some((result) => result.corpus_id === "small") &&
		results.some((result) => result.corpus_id === "medium") &&
		results.some((result) => result.corpus_id === "large")
	const gatedResults = results.filter((result) => result.gate === true)
	const informationalResults = results.filter((result) => result.gate !== true)
	const gateFEvaluable = protocolCompliant && machine.supported_platform
	const gateVerdict =
		gateFEvaluable && gatedResults.every((result) => result.verdict === "pass")
			? "pass"
			: "fail"

	return {
		schema_version: 1,
		task: "T9.4",
		corpus_version: manifest.corpus_version,
		generated_at_utc: new Date().toISOString(),
		release_build: {
			command: "npm run build",
			cli: relative(repoRoot, cliPath),
			node_flags: releaseNodeFlags,
		},
		protocol: {
			warmup_runs: options.warmups,
			measured_runs: options.runs,
			process_separated_runs: true,
			wall_clock_from_process_launch_to_exit: true,
			peak_rss_from_external_time_command: true,
			large_excluded_from_pass_fail: true,
			protocol_compliant: protocolCompliant,
		},
		reference_machine: machine,
		results,
		gate_f: {
			evaluable: gateFEvaluable,
			verdict: gateVerdict,
			gated_corpora: gatedResults.map((result) => result.corpus_id),
			informational_corpora: informationalResults.map((result) => result.corpus_id),
			large_excluded_from_pass_fail: true,
		},
	}
}

function renderMarkdownReport(report) {
	const lines = [
		"# Gate F Performance Report",
		"",
		`- Task: \`${report.task}\``,
		`- Corpus version: \`${report.corpus_version}\``,
		`- Generated at UTC: \`${report.generated_at_utc}\``,
		`- Release build command: \`${report.release_build.command}\``,
		`- CLI: \`${report.release_build.cli}\``,
		`- Node flags: \`${report.release_build.node_flags.join(" ")}\``,
		`- Warm-up runs: ${report.protocol.warmup_runs}`,
		`- Measured process-separated runs: ${report.protocol.measured_runs}`,
		`- Protocol compliant: ${report.protocol.protocol_compliant ? "yes" : "no"}`,
		`- Gate F evaluable: ${report.gate_f.evaluable ? "yes" : "no"}`,
		`- Gate F verdict: ${report.gate_f.verdict}`,
		"",
		"## Reference Machine",
		"",
		`- Platform: ${report.reference_machine.platform}`,
		`- Architecture: ${report.reference_machine.arch}`,
		`- Supported platform: ${report.reference_machine.supported_platform ? "yes" : "no"}`,
		`- OS release: ${report.reference_machine.os_release}`,
		`- CPU: ${report.reference_machine.cpu_model}`,
		`- CPU count: ${report.reference_machine.cpu_count}`,
		`- Memory: ${report.reference_machine.total_memory_mib} MiB`,
		`- Node: ${report.reference_machine.node_version}`,
		`- npm: ${report.reference_machine.npm_version}`,
		"",
		"## Results",
		"",
		"| Corpus | Product files | Anchors | Supported edges | p95 wall-clock | Peak RSS | Verdict |",
		"| --- | ---: | ---: | ---: | ---: | ---: | --- |",
	]

	for (const result of report.results) {
		lines.push(
			`| \`${result.corpus_id}\` | ${result.product_files} | ${result.observed_anchors} | ${result.supported_edges} | ${result.p95_wall_clock_ms} ms | ${result.peak_rss_mib} MiB | ${result.verdict} |`,
		)
	}

	lines.push("")
	lines.push("`large` is archived for trend tracking only and is excluded from pass/fail.")
	lines.push("")
	return lines.join("\n")
}

function writeReports(report, outDir) {
	mkdirSync(outDir, { recursive: true })
	writeFileSync(join(outDir, "gate-f-report.json"), `${JSON.stringify(report, null, "\t")}\n`, "utf8")
	writeFileSync(join(outDir, "gate-f-report.md"), renderMarkdownReport(report), "utf8")
}

function main() {
	const options = parseArgs(process.argv.slice(2))
	assertMeasurementEnvironment()
	const manifest = readManifest()
	const corpora = selectCorpora(manifest, options.corpus)
	const results = corpora.map((corpus) => benchmarkCorpus(corpus, options))
	const report = createReport(manifest, results, options)
	writeReports(report, options.outDir)

	if (report.gate_f.verdict !== "pass" && !options.allowIncompleteProtocol) {
		process.exitCode = 1
	}
}

try {
	main()
} catch (error) {
	if (error instanceof BenchmarkFailure) {
		process.stderr.write(`${error.message}\n`)
		process.exitCode = 1
	} else {
		throw error
	}
}
