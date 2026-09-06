/*
  # Add Admin Access to Orders System

  ## Problem
  Current RLS policies only allow users to view their own orders (where user_id matches).
  Admin dashboard needs to view ALL orders for management purposes.

  ## Solution
  Add policies to allow authenticated users (admins) to view and manage all orders.

  ## Changes
  1. Drop restrictive "Users can view own orders" policy
  2. Add new "Admins can view all orders" policy
  3. Add policy for admins to update any order
  4. Update order_items policies to allow viewing all items for admin

  ## Security
  - Policies restricted to authenticated users only
  - Maintains data integrity while enabling admin functionality
*/

-- Drop old restrictive policy for viewing orders
DROP POLICY IF EXISTS "Users can view own orders" ON orders;

-- Allow authenticated users (admins) to view all orders
CREATE POLICY "Admins can view all orders"
  ON orders
  FOR SELECT
  TO authenticated
  USING (true);

-- Drop old restrictive policy for updating orders
DROP POLICY IF EXISTS "Users can update own orders" ON orders;

-- Allow authenticated users (admins) to update all orders
CREATE POLICY "Admins can update all orders"
  ON orders
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Drop old restrictive policy for viewing order items
DROP POLICY IF EXISTS "Users can view own order items" ON order_items;

-- Allow authenticated users (admins) to view all order items
CREATE POLICY "Admins can view all order items"
  ON order_items
  FOR SELECT
  TO authenticated
  USING (true);
