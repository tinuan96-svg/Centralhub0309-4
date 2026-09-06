/*
# Fix Household and Personal Care category alignment

## Problem
Products under "Household" and "Personal Care" departments have their `category` column
set to "Household" or "Personal Care" (the department name), but the CATEGORY_HIERARCHY
constant expects the `category` column to contain the specific category like "Laundry",
"Cleaning", "Bath", "Oral Care", etc.

## Fix
For Household products: move the subcategory value into the category column, then null out subcategory
For Personal Care products: same approach

This aligns the database with the hierarchy constant so filter dropdowns work correctly.
*/

-- Fix Household: category should be the specific type (Laundry, Cleaning, etc.)
UPDATE products
SET category = subcategory,
    subcategory = NULL
WHERE department = 'Household' AND subcategory IS NOT NULL;

-- Fix Personal Care: category should be the specific type (Bath, Oral Care, etc.)
UPDATE products
SET category = subcategory,
    subcategory = NULL
WHERE department = 'Personal Care' AND subcategory IS NOT NULL;

-- Fix any remaining Household/Personal Care with NULL subcategory
UPDATE products SET category = 'Kitchen Essentials'
WHERE department = 'Household' AND category = 'Household';

UPDATE products SET category = 'Bath'
WHERE department = 'Personal Care' AND category = 'Personal Care';
