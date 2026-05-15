import { strict as assert } from "node:assert";
import { readFileSync, rmSync } from "node:fs";
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

interface PublicationEvidenceReport {
	release_verdict: string;
	publication_checklist: {
		verdict: string;
		publication_evidence: {
			status: string;
			version_coherence: {
				status: string;
				expected_package_version: string;
				expected_tarball_file: string;
				expected_repository_tag: string;
				checked_artifacts: Array<{ name: string; path: string }>;
				mismatches: PublicationVersionMismatch[];
				blocking_mismatches: PublicationVersionMismatch[];
			};
		};
	};
}

interface PublicationVersionMismatch {
	path: string;
	field: string;
	expected: unknown;
	actual: unknown;
	blocking: boolean;
	message: string;
}

function readPublicationEvidenceReport(outDir: string): PublicationEvidenceReport {
	return readJson<PublicationEvidenceReport>(resolve(outDir, "release-report.json"));
}

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

test("release gate aggregator accepts T10.6 identity encoded only by registry coordinate", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writePublicationEvidence(evidence.evidenceDir);
		writeT10_6PublicationEvidence(evidence.evidenceDir);
		const publicationPath = resolve(evidence.evidenceDir, "t10.6-publication-evidence.json");
		const publication = readJson<Record<string, unknown>>(publicationPath);
		delete publication.package_name;
		delete publication.package_version;
		writeJson(publicationPath, publication);

		const result = runAggregator(evidence);
		assert.equal(result.status, 0, result.stderr);

		const versionCoherence = readPublicationEvidenceReport(evidence.outDir).publication_checklist
			.publication_evidence.version_coherence;
		assert.equal(versionCoherence.status, "pass");
		assert.deepEqual(versionCoherence.blocking_mismatches, []);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator reports stale T10.6 publication version mismatches", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writePublicationEvidence(evidence.evidenceDir);
		writeT10_6PublicationEvidence(evidence.evidenceDir);
		const publicationPath = resolve(evidence.evidenceDir, "t10.6-publication-evidence.json");
		const publication = readJson<Record<string, unknown>>(publicationPath);
		publication.package_version = "1.2.1";
		writeJson(publicationPath, publication);

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readPublicationEvidenceReport(evidence.outDir);
		const versionCoherence = report.publication_checklist.publication_evidence.version_coherence;
		assert.equal(report.release_verdict, "fail");
		assert.equal(report.publication_checklist.verdict, "fail");
		assert.equal(versionCoherence.status, "fail");
		assert.ok(
			versionCoherence.mismatches.some(
				(mismatch) =>
					mismatch.path === "evidence/t10.6-publication-evidence.json" &&
					mismatch.field === "package_version" &&
					mismatch.expected === EXPECTED_PACKAGE_VERSION &&
					mismatch.actual === "1.2.1",
			),
		);
		assert.match(
			readFileSync(resolve(evidence.outDir, "release-report.md"), "utf8"),
			/publication evidence version mismatch: evidence\/t10\.6-publication-evidence\.json package_version/u,
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator reports stale T10.6 tarball filenames", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writePublicationEvidence(evidence.evidenceDir);
		writeT10_6PublicationEvidence(evidence.evidenceDir);
		const publicationPath = resolve(evidence.evidenceDir, "t10.6-publication-evidence.json");
		const publication = readJson<Record<string, unknown>>(publicationPath);
		publication.tarball_file = "anchormap-1.2.1.tgz";
		writeJson(publicationPath, publication);

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const versionCoherence = readPublicationEvidenceReport(evidence.outDir).publication_checklist
			.publication_evidence.version_coherence;
		assert.equal(versionCoherence.status, "fail");
		assert.ok(
			versionCoherence.mismatches.some(
				(mismatch) =>
					mismatch.field === "tarball_file" &&
					mismatch.expected === `anchormap-${EXPECTED_PACKAGE_VERSION}.tgz` &&
					mismatch.actual === "anchormap-1.2.1.tgz",
			),
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator reports stale T10.6 distribution and publish-result coordinates", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writePublicationEvidence(evidence.evidenceDir);
		writeT10_6PublicationEvidence(evidence.evidenceDir);
		const publicationPath = resolve(evidence.evidenceDir, "t10.6-publication-evidence.json");
		const publication = readJson<Record<string, unknown>>(publicationPath);
		const distributionChannel = publication.distribution_channel as Record<string, unknown>;
		const publicationDetails = publication.publication as Record<string, unknown>;
		const npmPublishResult = publicationDetails.npm_publish_result as Record<string, unknown>;
		distributionChannel.package_coordinate = "anchormap@1.2.1";
		npmPublishResult.id = "anchormap@1.2.1";
		writeJson(publicationPath, publication);

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const versionCoherence = readPublicationEvidenceReport(evidence.outDir).publication_checklist
			.publication_evidence.version_coherence;
		assert.equal(versionCoherence.status, "fail");
		assert.ok(
			versionCoherence.mismatches.some(
				(mismatch) =>
					mismatch.field === "distribution_channel.package_coordinate" &&
					mismatch.actual === "anchormap@1.2.1",
			),
		);
		assert.ok(
			versionCoherence.mismatches.some(
				(mismatch) =>
					mismatch.field === "publication.npm_publish_result.id" &&
					mismatch.actual === "anchormap@1.2.1",
			),
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator reports T10.6 checksums that diverge from T10.5", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writePublicationEvidence(evidence.evidenceDir);
		writeT10_6PublicationEvidence(evidence.evidenceDir);
		const publicationPath = resolve(evidence.evidenceDir, "t10.6-publication-evidence.json");
		const publication = readJson<Record<string, unknown>>(publicationPath);
		publication.sha256 = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
		writeJson(publicationPath, publication);

		const result = runAggregator(evidence);
		assert.equal(result.status, 0, result.stderr);

		const versionCoherence = readPublicationEvidenceReport(evidence.outDir).publication_checklist
			.publication_evidence.version_coherence;
		assert.equal(versionCoherence.status, "pass");
		assert.deepEqual(versionCoherence.blocking_mismatches, []);
		assert.ok(
			versionCoherence.mismatches.some(
				(mismatch) =>
					mismatch.field === "sha256" &&
					mismatch.actual === "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
			),
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator accepts internally coherent regenerated T10.6 tarball evidence", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writePublicationEvidence(evidence.evidenceDir);
		writeT10_6PublicationEvidence(evidence.evidenceDir);
		const publicationPath = resolve(evidence.evidenceDir, "t10.6-publication-evidence.json");
		const publication = readJson<Record<string, unknown>>(publicationPath);
		const artifact = publication.artifact as Record<string, unknown>;
		const publicationDetails = publication.publication as Record<string, unknown>;
		const npmPublishResult = publicationDetails.npm_publish_result as Record<string, unknown>;
		const postPublishVerification = publication.post_publish_verification as Record<
			string,
			unknown
		>;
		const registryMetadata = postPublishVerification.registry_metadata_lookup as Record<
			string,
			unknown
		>;
		const publishedDownload =
			postPublishVerification.published_tarball_download_verification as Record<string, unknown>;
		const npmIntegrity =
			"sha512-DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD==";
		const npmShasum = "dddddddddddddddddddddddddddddddddddddddd";
		const sha256 = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
		publication.regenerated_tarball = true;
		publication.dist_integrity = npmIntegrity;
		publication.dist_shasum = npmShasum;
		publication.sha256 = sha256;
		artifact.tarball_path = `reports/t10.6/anchormap-${EXPECTED_PACKAGE_VERSION}.tgz`;
		artifact.npm_integrity = npmIntegrity;
		artifact.npm_shasum = npmShasum;
		artifact.sha256 = sha256;
		npmPublishResult.integrity = npmIntegrity;
		npmPublishResult.shasum = npmShasum;
		registryMetadata.dist_integrity = npmIntegrity;
		registryMetadata.dist_shasum = npmShasum;
		registryMetadata.matches_t10_5_artifact = false;
		publishedDownload.sha256 = sha256;
		publishedDownload.matches_t10_5_artifact = false;
		writeJson(publicationPath, publication);

		const result = runAggregator(evidence);
		assert.equal(result.status, 0, result.stderr);

		const versionCoherence = readPublicationEvidenceReport(evidence.outDir).publication_checklist
			.publication_evidence.version_coherence;
		assert.equal(versionCoherence.status, "pass");
		assert.deepEqual(versionCoherence.mismatches, []);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator reports regenerated T10.6 evidence without rerun checksum evidence", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writePublicationEvidence(evidence.evidenceDir);
		writeT10_6PublicationEvidence(evidence.evidenceDir);
		const publicationPath = resolve(evidence.evidenceDir, "t10.6-publication-evidence.json");
		const publication = readJson<Record<string, unknown>>(publicationPath);
		const artifact = publication.artifact as Record<string, unknown>;
		publication.regenerated_tarball = true;
		delete artifact.npm_integrity;
		delete artifact.npm_shasum;
		delete artifact.sha256;
		writeJson(publicationPath, publication);

		const result = runAggregator(evidence);
		assert.equal(result.status, 0, result.stderr);

		const versionCoherence = readPublicationEvidenceReport(evidence.outDir).publication_checklist
			.publication_evidence.version_coherence;
		assert.equal(versionCoherence.status, "pass");
		assert.deepEqual(versionCoherence.blocking_mismatches, []);
		assert.ok(
			versionCoherence.mismatches.some(
				(mismatch) =>
					mismatch.field === "artifact.npm_integrity" &&
					mismatch.expected === "valid npm integrity",
			),
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator reports regenerated T10.6 evidence with invalid checksum placeholders", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writePublicationEvidence(evidence.evidenceDir);
		writeT10_6PublicationEvidence(evidence.evidenceDir);
		const publicationPath = resolve(evidence.evidenceDir, "t10.6-publication-evidence.json");
		const publication = readJson<Record<string, unknown>>(publicationPath);
		const artifact = publication.artifact as Record<string, unknown>;
		const publicationDetails = publication.publication as Record<string, unknown>;
		const npmPublishResult = publicationDetails.npm_publish_result as Record<string, unknown>;
		const postPublishVerification = publication.post_publish_verification as Record<
			string,
			unknown
		>;
		const registryMetadata = postPublishVerification.registry_metadata_lookup as Record<
			string,
			unknown
		>;
		const publishedDownload =
			postPublishVerification.published_tarball_download_verification as Record<string, unknown>;
		publication.regenerated_tarball = true;
		artifact.npm_integrity = null;
		artifact.npm_shasum = null;
		artifact.sha256 = null;
		delete publication.dist_integrity;
		delete publication.dist_shasum;
		delete publication.sha256;
		delete npmPublishResult.integrity;
		delete npmPublishResult.shasum;
		delete registryMetadata.dist_integrity;
		delete registryMetadata.dist_shasum;
		delete publishedDownload.sha256;
		writeJson(publicationPath, publication);

		const result = runAggregator(evidence);
		assert.equal(result.status, 0, result.stderr);

		const versionCoherence = readPublicationEvidenceReport(evidence.outDir).publication_checklist
			.publication_evidence.version_coherence;
		assert.equal(versionCoherence.status, "pass");
		assert.deepEqual(versionCoherence.blocking_mismatches, []);
		assert.ok(
			versionCoherence.mismatches.some(
				(mismatch) =>
					mismatch.field === "artifact.npm_integrity" &&
					mismatch.expected === "valid npm integrity",
			),
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator reports reused T10.6 evidence without T10.5 checksum evidence", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writePublicationEvidence(evidence.evidenceDir);
		writeT10_6PublicationEvidence(evidence.evidenceDir);
		rmSync(resolve(evidence.evidenceDir, "t10.5-tarball-artifact.json"), { force: true });

		const result = runAggregator(evidence);
		assert.equal(result.status, 0, result.stderr);

		const versionCoherence = readPublicationEvidenceReport(evidence.outDir).publication_checklist
			.publication_evidence.version_coherence;
		assert.equal(versionCoherence.status, "pass");
		assert.deepEqual(versionCoherence.blocking_mismatches, []);
		assert.ok(
			versionCoherence.mismatches.some(
				(mismatch) =>
					mismatch.field === "t10_5_tarball_artifact" &&
					mismatch.expected === "artifact checksum evidence",
			),
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator reports stale npm publish-result checksums", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writePublicationEvidence(evidence.evidenceDir);
		writeT10_6PublicationEvidence(evidence.evidenceDir);
		const publicationPath = resolve(evidence.evidenceDir, "t10.6-publication-evidence.json");
		const publication = readJson<Record<string, unknown>>(publicationPath);
		const publicationDetails = publication.publication as Record<string, unknown>;
		const npmPublishResult = publicationDetails.npm_publish_result as Record<string, unknown>;
		npmPublishResult.integrity =
			"sha512-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC==";
		npmPublishResult.shasum = "cccccccccccccccccccccccccccccccccccccccc";
		writeJson(publicationPath, publication);

		const result = runAggregator(evidence);
		assert.equal(result.status, 0, result.stderr);

		const versionCoherence = readPublicationEvidenceReport(evidence.outDir).publication_checklist
			.publication_evidence.version_coherence;
		assert.equal(versionCoherence.status, "pass");
		assert.deepEqual(versionCoherence.blocking_mismatches, []);
		assert.ok(
			versionCoherence.mismatches.some(
				(mismatch) =>
					mismatch.field === "publication.npm_publish_result.integrity" &&
					mismatch.actual ===
						"sha512-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC==",
			),
		);
		assert.ok(
			versionCoherence.mismatches.some(
				(mismatch) =>
					mismatch.field === "publication.npm_publish_result.shasum" &&
					mismatch.actual === "cccccccccccccccccccccccccccccccccccccccc",
			),
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator fails incoherent T10.5 tarball and dry-run evidence", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writePublicationEvidence(evidence.evidenceDir);
		const dryRunPath = resolve(evidence.evidenceDir, "t10.5-publication-dry-run.json");
		const dryRun = readJson<Record<string, unknown>>(dryRunPath);
		dryRun.package_version = "1.2.1";
		dryRun.tarball_file = "anchormap-1.2.1.tgz";
		writeJson(dryRunPath, dryRun);

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const versionCoherence = readPublicationEvidenceReport(evidence.outDir).publication_checklist
			.publication_evidence.version_coherence;
		assert.equal(versionCoherence.status, "fail");
		assert.ok(
			versionCoherence.mismatches.some(
				(mismatch) =>
					mismatch.path === "evidence/t10.5-publication-dry-run.json" &&
					mismatch.field === "package_version" &&
					mismatch.actual === "1.2.1",
			),
		);
		assert.ok(
			versionCoherence.mismatches.some(
				(mismatch) =>
					mismatch.path === "evidence/t10.5-publication-dry-run.json" &&
					mismatch.field === "tarball_file" &&
					mismatch.actual === "anchormap-1.2.1.tgz",
			),
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator reports stale T10.6 repository tag evidence", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writePublicationEvidence(evidence.evidenceDir);
		writeT10_6PublicationEvidence(evidence.evidenceDir);
		const publicationPath = resolve(evidence.evidenceDir, "t10.6-publication-evidence.json");
		const publication = readJson<Record<string, unknown>>(publicationPath);
		publication.repository_tag = {
			local_status: 0,
			tag: "v1.2.1",
			target_commit: "0123456789abcdef0123456789abcdef01234567",
			push_status: 0,
			pushed: true,
			remote_ref: "refs/tags/v1.2.1",
		};
		writeJson(publicationPath, publication);

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const versionCoherence = readPublicationEvidenceReport(evidence.outDir).publication_checklist
			.publication_evidence.version_coherence;
		assert.equal(versionCoherence.status, "fail");
		assert.ok(
			versionCoherence.mismatches.some(
				(mismatch) =>
					mismatch.field === "repository_tag.tag" &&
					mismatch.expected === `v${EXPECTED_PACKAGE_VERSION}` &&
					mismatch.actual === "v1.2.1",
			),
		);
		assert.ok(
			versionCoherence.mismatches.some(
				(mismatch) =>
					mismatch.field === "repository_tag.remote_ref" &&
					mismatch.expected === `refs/tags/v${EXPECTED_PACKAGE_VERSION}` &&
					mismatch.actual === "refs/tags/v1.2.1",
			),
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator reports missing repository tag evidence when T10.6 is present", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writePublicationEvidence(evidence.evidenceDir);
		writeT10_6PublicationEvidence(evidence.evidenceDir);
		const publicationPath = resolve(evidence.evidenceDir, "t10.6-publication-evidence.json");
		const publication = readJson<Record<string, unknown>>(publicationPath);
		delete publication.repository_tag;
		writeJson(publicationPath, publication);

		const result = runAggregator(evidence);
		assert.equal(result.status, 0, result.stderr);

		const versionCoherence = readPublicationEvidenceReport(evidence.outDir).publication_checklist
			.publication_evidence.version_coherence;
		assert.equal(versionCoherence.status, "pass");
		assert.deepEqual(versionCoherence.blocking_mismatches, []);
		assert.ok(
			versionCoherence.mismatches.some(
				(mismatch) => mismatch.field === "repository_tag" && mismatch.expected === "object",
			),
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator reports repository tag evidence that was not pushed", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writePublicationEvidence(evidence.evidenceDir);
		writeT10_6PublicationEvidence(evidence.evidenceDir);
		const publicationPath = resolve(evidence.evidenceDir, "t10.6-publication-evidence.json");
		const publication = readJson<Record<string, unknown>>(publicationPath);
		publication.repository_tag = {
			local_status: 0,
			tag: `v${EXPECTED_PACKAGE_VERSION}`,
			target_commit: "0123456789abcdef0123456789abcdef01234567",
			push_status: 1,
			pushed: false,
			remote_ref: `refs/tags/v${EXPECTED_PACKAGE_VERSION}`,
		};
		writeJson(publicationPath, publication);

		const result = runAggregator(evidence);
		assert.equal(result.status, 0, result.stderr);

		const versionCoherence = readPublicationEvidenceReport(evidence.outDir).publication_checklist
			.publication_evidence.version_coherence;
		assert.equal(versionCoherence.status, "pass");
		assert.deepEqual(versionCoherence.blocking_mismatches, []);
		assert.ok(
			versionCoherence.mismatches.some(
				(mismatch) => mismatch.field === "repository_tag.pushed" && mismatch.actual === false,
			),
		);
		assert.ok(
			versionCoherence.mismatches.some(
				(mismatch) => mismatch.field === "repository_tag.push_status" && mismatch.actual === 1,
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
