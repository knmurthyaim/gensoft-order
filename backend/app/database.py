import os

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

_raw_url = os.getenv("DATABASE_URL", "sqlite:///./order_system.db")
if _raw_url.startswith("postgres://"):
    _raw_url = _raw_url.replace("postgres://", "postgresql://", 1)

IS_SQLITE = _raw_url.startswith("sqlite")
if not IS_SQLITE and _raw_url.startswith("postgresql://"):
    _raw_url = _raw_url.replace("postgresql://", "postgresql+psycopg2://", 1)

SQLALCHEMY_DATABASE_URL = _raw_url

_engine_kwargs = {"pool_pre_ping": True}
_connect_args = {}
if IS_SQLITE:
    _connect_args = {"check_same_thread": False}

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args=_connect_args,
    **_engine_kwargs,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def _column_names(conn, table: str) -> set[str]:
    return {c["name"] for c in inspect(conn).get_columns(table)}


def migrate_db():
    """Add new columns on existing databases (SQLite + PostgreSQL)."""
    alters = [
        ("accounts", "allow_order_no_stock", "BOOLEAN", "0", "false"),
        ("accounts", "allow_order_over_stock", "BOOLEAN", "0", "false"),
        ("accounts", "display_stock_to_parties", "BOOLEAN", "1", "true"),
        ("accounts", "display_stock_to_salesrep", "BOOLEAN", "1", "true"),
        ("accounts", "hide_scheme_from_parties", "BOOLEAN", "1", "true"),
        ("accounts", "hide_scheme_from_salesrep", "BOOLEAN", "1", "true"),
        ("accounts", "hide_hold_products_from_salesrep", "BOOLEAN", "0", "false"),
        ("accounts", "track_salesrep_location", "BOOLEAN", "0", "false"),
        ("accounts", "minimum_order_value", "REAL", "0", "0"),
        ("accounts", "no_order_from", "TIMESTAMP", None, None),
        ("accounts", "no_order_to", "TIMESTAMP", None, None),
        ("accounts", "no_order_full_day", "BOOLEAN", "0", "false"),
        ("accounts", "approval_status", "VARCHAR", "'approved'", "'approved'"),
        ("accounts", "rejection_reason", "VARCHAR", "''", "''"),
        ("accounts", "approved_at", "TIMESTAMP", None, None),
        ("accounts", "approved_by_user_id", "INTEGER", None, None),
        ("accounts", "signup_notes", "VARCHAR", "''", "''"),
        ("products", "is_on_hold", "BOOLEAN", "0", "false"),
        ("products", "product_code", "VARCHAR", "''", "''"),
        ("orders", "remarks", "VARCHAR", "''", "''"),
        ("users", "sales_rep_id", "INTEGER", None, None),
        ("parties", "location_lat", "REAL", None, None),
        ("parties", "location_lng", "REAL", None, None),
        ("parties", "location_tagged_at", "TIMESTAMP", None, None),
        ("parties", "location_tagged_by_rep_id", "INTEGER", None, None),
    ]

    with engine.begin() as conn:
        for table, col, col_type, sqlite_default, pg_default in alters:
            try:
                existing = _column_names(conn, table)
            except Exception:
                continue
            if col in existing:
                continue
            if IS_SQLITE:
                default = f" DEFAULT {sqlite_default}" if sqlite_default is not None else ""
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}{default}"))
            else:
                if pg_default is not None:
                    conn.execute(
                        text(
                            f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} "
                            f"{col_type} DEFAULT {pg_default}"
                        )
                    )
                else:
                    conn.execute(
                        text(
                            f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {col_type}"
                        )
                    )

        try:
            if IS_SQLITE:
                conn.execute(
                    text(
                        "UPDATE products SET product_code = 'P' || printf('%04d', id) "
                        "WHERE product_code IS NULL OR product_code = ''"
                    )
                )
            else:
                conn.execute(
                    text(
                        "UPDATE products SET product_code = 'P' || LPAD(id::text, 4, '0') "
                        "WHERE product_code IS NULL OR product_code = ''"
                    )
                )
        except Exception:
            pass

        # Speed up rep/marketplace catalog filters as product volume grows
        for stmt in (
            "CREATE INDEX IF NOT EXISTS ix_products_owner_account_id ON products (owner_account_id)",
            "CREATE INDEX IF NOT EXISTS ix_products_owner_name ON products (owner_account_id, name)",
            "CREATE INDEX IF NOT EXISTS ix_stock_batches_owner ON stock_batches (owner_account_id)",
            "CREATE INDEX IF NOT EXISTS ix_stock_batches_product ON stock_batches (product_id)",
            "CREATE INDEX IF NOT EXISTS ix_stock_batches_owner_product ON stock_batches (owner_account_id, product_id)",
            "CREATE INDEX IF NOT EXISTS ix_parties_owner_account_id ON parties (owner_account_id)",
            "CREATE INDEX IF NOT EXISTS ix_parties_owner_name ON parties (owner_account_id, name)",
            "CREATE INDEX IF NOT EXISTS ix_parties_owner_type ON parties (owner_account_id, party_type)",
            "CREATE INDEX IF NOT EXISTS ix_srl_owner_recorded ON sales_rep_locations (owner_account_id, recorded_at)",
            "CREATE INDEX IF NOT EXISTS ix_srl_rep_recorded ON sales_rep_locations (sales_rep_id, recorded_at)",
        ):
            try:
                conn.execute(text(stmt))
            except Exception:
                pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
