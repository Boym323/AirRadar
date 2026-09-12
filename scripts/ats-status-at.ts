#!/usr/bin/env node
import "dotenv/config";
import { discoverAustroControl } from "../lib/atc/austro-control";
async function main(): Promise<void> { const discovery = await discoverAustroControl(); console.log(`ATS AT\nprovider: ${discovery.provider}\ncurrent: ${discovery.current?.effectiveFrom ?? "unavailable"}\nfuture: ${discovery.future?.effectiveFrom ?? "none"}`); }
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });

