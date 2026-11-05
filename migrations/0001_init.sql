-- Schema per SPEC.md section 6. Timestamps are UTC ISO-8601 text.

CREATE TABLE Assets (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  Symbol TEXT NOT NULL COLLATE NOCASE UNIQUE,
  Name TEXT NOT NULL,
  AssetType TEXT NOT NULL CHECK (AssetType IN ('Stock', 'ETF')),
  Exchange TEXT NOT NULL,
  Currency TEXT NOT NULL,
  AlertThresholdPercent REAL NOT NULL CHECK (AlertThresholdPercent > 0 AND AlertThresholdPercent < 100),
  IsActive INTEGER NOT NULL DEFAULT 1 CHECK (IsActive IN (0, 1)),
  CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UpdatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE MonthlyReferencePrices (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  AssetId INTEGER NOT NULL REFERENCES Assets(Id) ON DELETE CASCADE,
  ReferenceMonth TEXT NOT NULL,
  ReferenceDate TEXT NOT NULL,
  ReferencePrice REAL NOT NULL,
  Currency TEXT NOT NULL,
  IsBackfilled INTEGER NOT NULL DEFAULT 0 CHECK (IsBackfilled IN (0, 1)),
  UNIQUE (AssetId, ReferenceMonth)
);

CREATE TABLE ReferenceAdjustments (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  AssetId INTEGER NOT NULL REFERENCES Assets(Id) ON DELETE CASCADE,
  ReferenceMonth TEXT NOT NULL,
  OldPrice REAL NOT NULL,
  NewPrice REAL NOT NULL,
  DetectedAt TEXT NOT NULL
);

CREATE TABLE PriceHistory (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  AssetId INTEGER NOT NULL REFERENCES Assets(Id) ON DELETE CASCADE,
  PriceDate TEXT NOT NULL,
  Price REAL NOT NULL,
  Currency TEXT NOT NULL,
  RetrievedAt TEXT NOT NULL,
  Source TEXT NOT NULL,
  UNIQUE (AssetId, PriceDate)
);

CREATE TABLE RunLog (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  TriggerLabel TEXT NOT NULL,
  StartedAt TEXT NOT NULL,
  FinishedAt TEXT,
  AssetsChecked INTEGER NOT NULL DEFAULT 0,
  AssetsFailed INTEGER NOT NULL DEFAULT 0,
  Errors TEXT
);

CREATE TABLE CheckResults (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  AssetId INTEGER NOT NULL REFERENCES Assets(Id) ON DELETE CASCADE,
  RunDate TEXT NOT NULL,
  Outcome TEXT NOT NULL CHECK (Outcome IN ('ok', 'stale', 'held', 'error')),
  Detail TEXT,
  RunId INTEGER REFERENCES RunLog(Id),
  CheckedAt TEXT NOT NULL
);
CREATE INDEX idx_CheckResults_asset_date ON CheckResults (AssetId, RunDate);

CREATE TABLE AlertHistory (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  AssetId INTEGER NOT NULL REFERENCES Assets(Id) ON DELETE CASCADE,
  ReferenceMonth TEXT NOT NULL,
  TriggerPrice REAL NOT NULL,
  DropPercent REAL NOT NULL,
  TriggeredAt TEXT NOT NULL,
  SentAt TEXT,
  Status TEXT NOT NULL CHECK (Status IN ('Pending', 'Sent', 'Failed')),
  ProviderMessageId TEXT,
  ReferenceBackfilled INTEGER NOT NULL DEFAULT 0 CHECK (ReferenceBackfilled IN (0, 1)),
  UNIQUE (AssetId, ReferenceMonth)
);

CREATE TABLE SystemSettings (
  Key TEXT PRIMARY KEY,
  Value TEXT NOT NULL
);

INSERT INTO SystemSettings (Key, Value) VALUES
  ('timezone', 'Asia/Bangkok'),
  ('staleDays', '4'),
  ('holdJumpPercent', '40'),
  ('holdMaxRuns', '3'),
  ('lineMaxAttempts', '3'),
  ('lineRetrySeconds', '60');
