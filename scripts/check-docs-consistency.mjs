import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const docsRoot = resolve(process.env.DOCS_ROOT ?? join(rootDir, "docs"))
const tasksFile = resolve(process.env.TASKS_FILE ?? join(docsRoot, "tasks.md"))
const evalsFile = resolve(process.env.EVALS_FILE ?? join(docsRoot, "evals.md"))
const designFile = resolve(process.env.DESIGN_FILE ?? join(docsRoot, "design.md"))
const adrRegisterFile = resolve(process.env.ADR_REGISTER_FILE ?? join(docsRoot, "adr", "README.md"))
const adrDir = resolve(process.env.ADR_DIR ?? join(docsRoot, "adr"))
const repoDisplayRoot = dirname(docsRoot)

function fail(message) {
	process.stderr.write(`${message}\n`)
	process.exit(1)
}

function toDisplayPath(path) {
	return relative(repoDisplayRoot, path).split("\\").join("/")
}

function listMarkdownFiles(dir) {
	const entries = readdirSync(dir, { withFileTypes: true })
	const files = []

	for (const entry of entries.sort((left, right) => {
		if (left.name < right.name) return -1
		if (left.name > right.name) return 1
		return 0
	})) {
		const fullPath = join(dir, entry.name)
		if (entry.isDirectory()) {
			files.push(...listMarkdownFiles(fullPath))
			continue
		}
		if (entry.isFile() && entry.name.endsWith(".md")) {
			files.push(fullPath)
		}
	}

	return files
}

function collectBrokenDocLinks(files) {
	const errors = []
	const markdownLinkPattern = /\[[^\]]+\]\(([^)]+)\)/g

	for (const file of files) {
		const content = readFileSync(file, "utf8")
		for (const match of content.matchAll(markdownLinkPattern)) {
			const rawTarget = match[1].trim().replace(/^<|>$/g, "")
			if (rawTarget === "" || rawTarget.startsWith("#")) {
				continue
			}
			if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawTarget)) {
				continue
			}

			const [pathPart] = rawTarget.split("#", 1)
			const resolvedTarget = resolve(dirname(file), pathPart)
			if (!existsSync(resolvedTarget)) {
				errors.push(
					`validate: broken_doc_link: ${toDisplayPath(file)} references ${rawTarget}`,
				)
				continue
			}
			if (!lstatSync(resolvedTarget).isFile()) {
				errors.push(
					`validate: broken_doc_link: ${toDisplayPath(file)} references ${rawTarget}`,
				)
			}
		}
	}

	return errors
}

function buildAdrFileIndex() {
	const entries = readdirSync(adrDir, { withFileTypes: true })
	const index = new Map()

	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".md")) {
			continue
		}
		const match = /^(\d{4})-/.exec(entry.name)
		if (!match) {
			continue
		}
		const bucket = index.get(match[1]) ?? []
		bucket.push(entry.name)
		index.set(match[1], bucket)
	}

	for (const files of index.values()) {
		files.sort()
	}

	return index
}

function collectAdrReferenceErrors() {
	const errors = []
	const adrFilesById = buildAdrFileIndex()

	const designContent = readFileSync(designFile, "utf8")
	const designIds = [...designContent.matchAll(/ADR-(\d{4})/g)].map((match) => match[1])
	for (const id of [...new Set(designIds)].sort()) {
		const matches = adrFilesById.get(id) ?? []
		if (matches.length === 0) {
			errors.push(`validate: adr_reference_missing_file: ${toDisplayPath(designFile)} references ADR-${id}`)
			continue
		}
		if (matches.length > 1) {
			errors.push(`validate: adr_reference_ambiguous: ${toDisplayPath(designFile)} references ADR-${id}`)
		}
	}

	const adrRegisterContent = readFileSync(adrRegisterFile, "utf8")
	const registerIds = []
	for (const line of adrRegisterContent.split(/\r?\n/)) {
		const match = /^\| `ADR-(\d{4})` \|/.exec(line)
		if (match) {
			registerIds.push(match[1])
		}
	}
	for (const id of [...new Set(registerIds)].sort()) {
		const matches = adrFilesById.get(id) ?? []
		if (matches.length === 0) {
			errors.push(
				`validate: adr_reference_missing_file: ${toDisplayPath(adrRegisterFile)} references ADR-${id}`,
			)
			continue
		}
		if (matches.length > 1) {
			errors.push(`validate: adr_reference_ambiguous: ${toDisplayPath(adrRegisterFile)} references ADR-${id}`)
		}
	}

	return errors
}

function extractFixtureIds(filePath) {
	const content = readFileSync(filePath, "utf8")
	return new Set([...content.matchAll(/fx[0-9]{2}[a-z]?/g)].map((match) => match[0]))
}

function collectMissingFixtureErrors() {
	const evalFixtureIds = extractFixtureIds(evalsFile)
	const taskFixtureIds = [...extractFixtureIds(tasksFile)].sort()
	const errors = []

	for (const id of taskFixtureIds) {
		if (!evalFixtureIds.has(id)) {
			errors.push(
				`validate: task_fixture_reference_missing: ${toDisplayPath(tasksFile)} references ${id} not found in ${toDisplayPath(evalsFile)}`,
			)
		}
	}

	return errors
}

function collectDuplicateTaskHeadingErrors() {
	const headingPattern = /^### (T[0-9]+\.[0-9]+[a-z]*|S[0-9]+) /gm
	const counts = new Map()
	const content = readFileSync(tasksFile, "utf8")
	for (const match of content.matchAll(headingPattern)) {
		counts.set(match[1], (counts.get(match[1]) ?? 0) + 1)
	}

	const duplicates = [...counts.entries()]
		.filter(([, count]) => count > 1)
		.map(([id]) => id)
		.sort()

	return duplicates.map(
		(id) => `validate: task_heading_duplicate: ${toDisplayPath(tasksFile)} duplicates ${id}`,
	)
}

function main(argv) {
	if (argv.length > 0) {
		fail("validate: invalid_invocation: check-docs-consistency.sh takes no arguments")
	}

	if (!existsSync(docsRoot)) {
		fail(`validate: docs_root_missing: ${docsRoot}`)
	}
	for (const requiredFile of [tasksFile, evalsFile, designFile, adrRegisterFile]) {
		if (!existsSync(requiredFile)) {
			fail(`validate: docs_required_file_missing: ${requiredFile}`)
		}
	}
	if (!existsSync(adrDir)) {
		fail(`validate: docs_required_dir_missing: ${adrDir}`)
	}

	const markdownFiles = listMarkdownFiles(docsRoot)
	const errors = [
		...collectBrokenDocLinks(markdownFiles),
		...collectAdrReferenceErrors(),
		...collectMissingFixtureErrors(),
		...collectDuplicateTaskHeadingErrors(),
	]

	if (errors.length > 0) {
		for (const error of errors) {
			process.stderr.write(`${error}\n`)
		}
		process.exit(1)
	}
}

main(process.argv.slice(2))
