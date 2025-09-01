export interface MigrationAction {
  migrate: () => Promise<void>;
  rollback: () => Promise<void>;
}
