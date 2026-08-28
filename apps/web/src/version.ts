import pkg from "../../../package.json" with { type: "json" };

export const CREW_VERSION = String((pkg as { version: string }).version);
