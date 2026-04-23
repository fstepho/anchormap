#!/usr/bin/env node
import { runAnchormap } from "./cli/commands";

if (require.main === module) {
	process.exitCode = runAnchormap(process.argv.slice(2));
}
