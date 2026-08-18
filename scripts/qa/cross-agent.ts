#!/usr/bin/env bun
import { runDiscoveryCli } from "./discover-agents";

await runDiscoveryCli(Bun.argv.slice(2));
