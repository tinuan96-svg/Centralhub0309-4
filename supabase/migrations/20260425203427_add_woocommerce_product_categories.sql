/*
  # Add WooCommerce Product Categories

  Creates all product categories from the imported WooCommerce CSV file.
  Slug is derived from the name (lowercased, spaces replaced with hyphens).
*/

INSERT INTO main_categories (name, slug) VALUES
  ('Ready to eat', 'ready-to-eat'),
  ('Pickles & Preserves', 'pickles-preserves'),
  ('Flour & Grains', 'flour-grains'),
  ('Seasonings & Condiments', 'seasonings-condiments'),
  ('Curry Masalas', 'curry-masalas'),
  ('Snacks & Sweets', 'snacks-sweets'),
  ('Whole & Ground Spices', 'whole-ground-spices'),
  ('Pulses & Beans', 'pulses-beans'),
  ('Oils & Fats', 'oils-fats'),
  ('Tea & Coffee', 'tea-coffee'),
  ('Fryums', 'fryums'),
  ('Desserts', 'desserts'),
  ('Rices', 'rices'),
  ('Household & Cleaning', 'household-cleaning'),
  ('Health & Personal Care', 'health-personal-care')
ON CONFLICT (name) DO NOTHING;
