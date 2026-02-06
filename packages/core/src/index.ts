export {
  GSCClient,
  type GSCClientOptions,
  type IndexStatusResult,
  type IndexVerdict,
} from "./gsc-client.js";
export {
  SyncEngine,
  type SyncOptions,
  type SyncResult,
  type IndexStatusSyncResult,
} from "./sync-engine.js";
export {
  DecayDetector,
  defaultRules,
  type DecayRule,
  type DecaySignal,
  type QuietPeriodConfig,
} from "./decay-detector.js";
export {
  URLMatcher,
  type MatchResult,
  type URLMatcherConfig,
  type UnmatchReason,
  type MatchDiagnostics,
} from "./url-matcher.js";
export {
  TaskGenerator,
  type TaskGeneratorOptions,
  type QueryContext,
} from "./task-generator.js";
