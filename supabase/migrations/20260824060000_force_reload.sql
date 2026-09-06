-- Dummy migration to force schema cache reload
COMMENT ON TABLE competitor_prices IS 'Tracked competitor prices with high-precision matching metadata.';
NOTIFY pgrst, 'reload schema';
