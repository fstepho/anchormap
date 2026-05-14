import { strict as assert } from "node:assert";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
	createTempReleaseEvidence,
	EXPECTED_PACKAGE_VERSION,
	readJson,
	runAggregator,
	writeJson,
	writePublicationEvidence,
	writeT10_6PublicationEvidence,
} from "./release-gate-aggregator-test-support";

test("release gate aggregator validates present post-publication evidence without blocking pre-publication absence", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writePublicationEvidence(evidence.evidenceDir);
		writeT10_6PublicationEvidence(evidence.evidenceDir);

		const result = runAggregator(evidence);
		assert.equal(result.status, 0, result.stderr);

		const report = readJson<{
			release_verdict: string;
			publication_checklist: {
				verdict: string;
				post_m9_publication_evidence_artifacts: Array<{ name: string; status: string }>;
				publication_evidence: {
					status: string;
					t10_6_publication_evidence: { status: string };
				};
			};
		}>(resolve(evidence.outDir, "release-report.json"));
		assert.equal(report.release_verdict, "pass");
		assert.equal(report.publication_checklist.verdict, "pass");
		assert.deepEqual(
			report.publication_checklist.post_m9_publication_evidence_artifacts.map((artifact) => [
				artifact.name,
				artifact.status,
			]),
			[
				["consumer_lockback", "archived"],
				["t10_5_tarball_artifact", "archived"],
				["t10_5_publication_dry_run", "archived"],
				["t10_6_publication_evidence", "archived"],
			],
		);
		assert.equal(report.publication_checklist.publication_evidence.status, "pass");
		assert.equal(
			report.publication_checklist.publication_evidence.t10_6_publication_evidence.status,
			"pass",
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator keeps the M9 verdict independent of post-M9 publication evidence", () => {
	const evidence = createTempReleaseEvidence();
	try {
		rmSync(resolve(evidence.evidenceDir, "consumer-lockback.json"), { force: true });
		rmSync(resolve(evidence.evidenceDir, "t10.5-tarball-artifact.json"), { force: true });
		rmSync(resolve(evidence.evidenceDir, "t10.5-publication-dry-run.json"), { force: true });
		rmSync(resolve(evidence.evidenceDir, "t10.6-publication-evidence.json"), { force: true });

		const result = runAggregator(evidence);
		assert.equal(result.status, 0, result.stderr);

		const report = readJson<{
			release_verdict: string;
			publication_checklist: {
				verdict: string;
				missing_blocking_artifacts: string[];
				post_m9_publication_evidence_artifacts: Array<{ name: string; status: string }>;
				publication_evidence: {
					status: string;
					consumer_lockback: { status: string };
					t10_5_tarball_artifact: { status: string };
					t10_5_publication_dry_run: { status: string };
					t10_6_publication_evidence: { status: string };
				};
			};
		}>(resolve(evidence.outDir, "release-report.json"));

		assert.equal(report.release_verdict, "pass");
		assert.equal(report.publication_checklist.verdict, "pass");
		assert.deepEqual(report.publication_checklist.missing_blocking_artifacts, []);
		assert.deepEqual(
			report.publication_checklist.post_m9_publication_evidence_artifacts.map((artifact) => [
				artifact.name,
				artifact.status,
			]),
			[
				["consumer_lockback", "pending"],
				["t10_5_tarball_artifact", "pending"],
				["t10_5_publication_dry_run", "pending"],
				["t10_6_publication_evidence", "pending"],
			],
		);
		assert.equal(report.publication_checklist.publication_evidence.status, "pass");
		assert.equal(
			report.publication_checklist.publication_evidence.consumer_lockback.status,
			"pending",
		);
		assert.equal(
			report.publication_checklist.publication_evidence.t10_5_tarball_artifact.status,
			"pending",
		);
		assert.equal(
			report.publication_checklist.publication_evidence.t10_5_publication_dry_run.status,
			"pending",
		);
		assert.equal(
			report.publication_checklist.publication_evidence.t10_6_publication_evidence.status,
			"pending",
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator semantically validates the entropy review artifact", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writeJson(resolve(evidence.rootDir, "reports", "t9.7", "entropy-review.json"), {
			schema_version: 1,
			task: "T9.7",
			report_version: "entropy-review-v1",
			summary: {
				findings_count: 1,
				blocking_findings_remaining: 0,
				unclassified_drift_remaining: false,
			},
			findings: [
				{
					id: "T9.7-F1",
					title: "Finding with incomplete required review routing fields",
					primary_classification: "todo",
					blocking_status: "unknown",
				},
			],
			release_candidate_review_set: {
				unclassified_drift_remaining: false,
			},
		});

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			publication_checklist: {
				verdict: string;
				entropy_review: {
					status: string;
					validation_errors: string[];
					findings_with_unsupported_primary_classification: Array<{
						finding: string;
						primary_classification: string;
					}>;
					findings_with_unsupported_blocking_status: Array<{
						finding: string;
						blocking_status: string;
					}>;
					findings_missing_follow_up_disposition: string[];
				};
			};
		}>(resolve(evidence.outDir, "release-report.json"));
		assert.equal(report.release_verdict, "fail");
		assert.equal(report.publication_checklist.verdict, "fail");
		assert.equal(report.publication_checklist.entropy_review.status, "fail");
		assert.ok(
			report.publication_checklist.entropy_review.validation_errors.includes(
				"entropy review findings use unsupported primary_classification",
			),
		);
		assert.deepEqual(
			report.publication_checklist.entropy_review.findings_with_unsupported_primary_classification,
			[
				{
					finding: "T9.7-F1",
					primary_classification: "todo",
				},
			],
		);
		assert.deepEqual(
			report.publication_checklist.entropy_review.findings_with_unsupported_blocking_status,
			[
				{
					finding: "T9.7-F1",
					blocking_status: "unknown",
				},
			],
		);
		assert.deepEqual(
			report.publication_checklist.entropy_review.findings_missing_follow_up_disposition,
			["T9.7-F1"],
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator fails closed when entropy review reports unresolved drift", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writeJson(resolve(evidence.rootDir, "reports", "t9.7", "entropy-review.json"), {
			schema_version: 1,
			task: "T9.7",
			report_version: "entropy-review-v1",
			summary: {
				findings_count: 0,
				blocking_findings_remaining: 1,
				unclassified_drift_remaining: false,
			},
			findings: [],
			release_candidate_review_set: {
				unclassified_drift_remaining: true,
			},
		});

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			publication_checklist: {
				verdict: string;
				entropy_review: {
					status: string;
					validation_errors: string[];
					blocking_findings_remaining: number | null;
					unclassified_drift_remaining: boolean | null;
				};
			};
		}>(resolve(evidence.outDir, "release-report.json"));
		assert.equal(report.release_verdict, "fail");
		assert.equal(report.publication_checklist.verdict, "fail");
		assert.equal(report.publication_checklist.entropy_review.status, "fail");
		assert.equal(report.publication_checklist.entropy_review.blocking_findings_remaining, 1);
		assert.equal(report.publication_checklist.entropy_review.unclassified_drift_remaining, true);
		assert.ok(
			report.publication_checklist.entropy_review.validation_errors.includes(
				"entropy review summary.blocking_findings_remaining must be 0",
			),
		);
		assert.ok(
			report.publication_checklist.entropy_review.validation_errors.includes(
				"entropy review release_candidate_review_set.unclassified_drift_remaining must be false",
			),
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator validates present T10 package identity without requiring T10 evidence", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writePublicationEvidence(evidence.evidenceDir);
		const lockbackPath = resolve(evidence.evidenceDir, "consumer-lockback.json");
		const tarballPath = resolve(evidence.evidenceDir, "t10.5-tarball-artifact.json");
		const lockback = readJson<Record<string, unknown>>(lockbackPath);
		const tarball = readJson<Record<string, unknown>>(tarballPath);
		lockback.package_name = "other";
		tarball.package_version = "1.0.1";
		writeJson(lockbackPath, lockback);
		writeJson(tarballPath, tarball);

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			publication_checklist: {
				verdict: string;
				publication_evidence: {
					status: string;
					consumer_lockback: { status: string };
					t10_5_tarball_artifact: { status: string };
					validation_errors: string[];
				};
			};
		}>(resolve(evidence.outDir, "release-report.json"));
		const publicationEvidence = report.publication_checklist.publication_evidence;
		assert.equal(report.release_verdict, "fail");
		assert.equal(report.publication_checklist.verdict, "fail");
		assert.equal(publicationEvidence.status, "fail");
		assert.equal(publicationEvidence.consumer_lockback.status, "fail");
		assert.equal(publicationEvidence.t10_5_tarball_artifact.status, "fail");
		assert.ok(
			publicationEvidence.validation_errors.includes(
				"consumer lockback package_name must be anchormap",
			),
		);
		assert.ok(
			publicationEvidence.validation_errors.includes(
				`T10.5 tarball artifact package_version must be ${EXPECTED_PACKAGE_VERSION}`,
			),
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator validates T10.6 package coordinate without owning artifact proof", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writePublicationEvidence(evidence.evidenceDir);
		writeT10_6PublicationEvidence(evidence.evidenceDir);
		const publicationPath = resolve(evidence.evidenceDir, "t10.6-publication-evidence.json");
		const publication = readJson<Record<string, unknown>>(publicationPath);
		publication.registry_coordinate = `other@${EXPECTED_PACKAGE_VERSION}`;
		publication.tarball_file = `anchormap-${EXPECTED_PACKAGE_VERSION}-rebuilt.tgz`;
		publication.dist_shasum = "cccccccccccccccccccccccccccccccccccccccc";
		writeJson(publicationPath, publication);

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			publication_checklist: {
				verdict: string;
				publication_evidence: {
					status: string;
					t10_6_publication_evidence: { status: string };
					validation_errors: string[];
				};
			};
		}>(resolve(evidence.outDir, "release-report.json"));
		const publicationEvidence = report.publication_checklist.publication_evidence;
		assert.equal(report.release_verdict, "fail");
		assert.equal(report.publication_checklist.verdict, "fail");
		assert.equal(publicationEvidence.status, "fail");
		assert.equal(publicationEvidence.t10_6_publication_evidence.status, "fail");
		assert.ok(
			publicationEvidence.validation_errors.includes(
				"T10.6 registry_coordinate package name must be anchormap",
			),
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator leaves T10.5 implementation proof obligations to later tasks", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writePublicationEvidence(evidence.evidenceDir);
		const tarballPath = resolve(evidence.evidenceDir, "t10.5-tarball-artifact.json");
		const tarball = readJson<Record<string, unknown>>(tarballPath);
		tarball.included_files = ["package.json"];
		delete tarball.release_evidence_links;
		writeJson(tarballPath, tarball);

		const result = runAggregator(evidence);
		assert.equal(result.status, 0, result.stderr);

		const report = readJson<{
			release_verdict: string;
			publication_checklist: {
				verdict: string;
				publication_evidence: {
					status: string;
					t10_5_tarball_artifact: { status: string };
					validation_errors: string[];
				};
			};
		}>(resolve(evidence.outDir, "release-report.json"));
		assert.equal(report.release_verdict, "pass");
		assert.equal(report.publication_checklist.verdict, "pass");
		assert.equal(report.publication_checklist.publication_evidence.status, "pass");
		assert.equal(
			report.publication_checklist.publication_evidence.t10_5_tarball_artifact.status,
			"pass",
		);
		assert.deepEqual(report.publication_checklist.publication_evidence.validation_errors, []);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator records missing post-M9 publication artifacts as pending", () => {
	const evidence = createTempReleaseEvidence();
	try {
		rmSync(resolve(evidence.evidenceDir, "t10.5-publication-dry-run.json"), { force: true });

		const result = runAggregator(evidence);
		assert.equal(result.status, 0, result.stderr);

		const report = readJson<{
			release_verdict: string;
			publication_checklist: {
				verdict: string;
				missing_blocking_artifacts: string[];
				publication_evidence: {
					status: string;
					t10_5_publication_dry_run: { status: string };
					validation_errors: string[];
				};
			};
		}>(resolve(evidence.outDir, "release-report.json"));
		const publicationEvidence = report.publication_checklist.publication_evidence;
		assert.equal(report.release_verdict, "pass");
		assert.equal(report.publication_checklist.verdict, "pass");
		assert.deepEqual(report.publication_checklist.missing_blocking_artifacts, []);
		assert.equal(publicationEvidence.status, "pass");
		assert.equal(publicationEvidence.t10_5_publication_dry_run.status, "pending");
		assert.deepEqual(publicationEvidence.validation_errors, []);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator fails present null post-M9 publication evidence", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writeJson(resolve(evidence.evidenceDir, "consumer-lockback.json"), null);

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			publication_checklist: {
				verdict: string;
				publication_evidence: {
					status: string;
					consumer_lockback: { status: string };
					validation_errors: string[];
				};
			};
		}>(resolve(evidence.outDir, "release-report.json"));
		assert.equal(report.release_verdict, "fail");
		assert.equal(report.publication_checklist.verdict, "fail");
		assert.equal(report.publication_checklist.publication_evidence.status, "fail");
		assert.equal(
			report.publication_checklist.publication_evidence.consumer_lockback.status,
			"fail",
		);
		assert.ok(
			report.publication_checklist.publication_evidence.validation_errors.includes(
				"consumer lockback evidence must be a JSON object",
			),
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

for (const status of ["fail", "pending", "error", "pas"] as const) {
	test(`release gate aggregator fails present post-M9 publication evidence status ${status}`, () => {
		const evidence = createTempReleaseEvidence();
		try {
			writePublicationEvidence(evidence.evidenceDir);
			const tarballPath = resolve(evidence.evidenceDir, "t10.5-tarball-artifact.json");
			const tarball = readJson<Record<string, unknown>>(tarballPath);
			tarball.status = status;
			writeJson(tarballPath, tarball);

			const result = runAggregator(evidence);
			assert.equal(result.status, 1);

			const report = readJson<{
				release_verdict: string;
				publication_checklist: {
					verdict: string;
					publication_evidence: {
						status: string;
						t10_5_tarball_artifact: { status: string };
						validation_errors: string[];
					};
				};
			}>(resolve(evidence.outDir, "release-report.json"));
			assert.equal(report.release_verdict, "fail");
			assert.equal(report.publication_checklist.verdict, "fail");
			assert.equal(report.publication_checklist.publication_evidence.status, "fail");
			assert.equal(
				report.publication_checklist.publication_evidence.t10_5_tarball_artifact.status,
				"fail",
			);
			assert.ok(
				report.publication_checklist.publication_evidence.validation_errors.includes(
					"T10.5 tarball artifact status must be pass when present",
				),
			);
		} finally {
			rmSync(evidence.rootDir, { recursive: true, force: true });
		}
	});
}
