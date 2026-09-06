export interface Subcategory {
  name: string;
}

export interface Category {
  name: string;
  subcategories: string[];
}

export interface Department {
  name: string;
  categories: Category[];
}

export const CATEGORY_HIERARCHY: Department[] = [
  {
    name: 'Dry Foods',
    categories: [
      { name: 'Rice', subcategories: ['Matta Rice', 'Basmati Rice', 'Ponni Rice', 'Jaya Rice', 'Idli Rice', 'Jeerakasala Rice', 'Raw Rice', 'Boiled Rice', 'Broken Rice', 'Surekha Rice'] },
      { name: 'Flour & Grains', subcategories: ['Puttu Podi', 'Appam Podi', 'Idiyappam Podi', 'Pathiri Podi', 'Dosa Mix', 'Idli Mix', 'Rice Flour', 'Roasted Rice Powder', 'Atta', 'Gram Flour', 'Ragi Powder', 'Aval', 'Idly Rava', 'Semolina'] },
      { name: 'Pulses & Beans', subcategories: [] },
      { name: 'Oils & Ghee', subcategories: ['Coconut Oil', 'Sunflower Oil', 'Sesame Oil', 'Olive Oil', 'Ghee'] },
      { name: 'Whole Spices', subcategories: ['Pepper', 'Cardamom', 'Cloves', 'Mustard', 'Jeera', 'Fennel', 'Bay Leaves', 'Star Anise', 'Nutmeg', 'Cinnamon', 'Coriander Seeds', 'Dried Ginger', 'Chia Seeds'] },
      { name: 'Ground Spices', subcategories: ['Chilli Powder', 'Turmeric', 'Coriander Powder', 'Pepper Powder', 'Cinnamon Powder', 'Fenugreek Powder'] },
      { name: 'Curry Masalas', subcategories: ['Chicken Masala', 'Fish Masala', 'Fish Fry', 'Meat Masala', 'Beef Masala', 'Mutton Masala', 'Egg Roast', 'Sambar Powder', 'Rasam Powder', 'Biryani Masala', 'Chicken 65', 'Chilli Chicken'] },
      { name: 'Pickles', subcategories: ['Mango', 'Tender Mango', 'Kaduku Mango', 'Lime', 'Garlic', 'Ginger', 'Fish', 'Anchovy', 'Prawn', 'Mixed', 'Amla', 'Dates'] },
      { name: 'Cooking Essentials', subcategories: ['Salt', 'Sugar', 'Honey', 'Tamarind', 'Vinegar', 'Tomato Ketchup', 'Coconut Milk Powder', 'Ginger Garlic Paste', 'Curry Leaf Powder', 'Sauces'] },
      { name: 'Desserts', subcategories: ['Palada', 'Ada', 'Vermicelli', 'Payasam Mix', 'Semiya Mix'] },
      { name: 'Ready to Eat', subcategories: ['Fish Curry', 'Curries', 'Rice Meals', 'Noodles', 'Instant Meals', 'Canned Fish', 'Ready Mixes'] },
      { name: 'Snacks', subcategories: ['Banana Chips', 'Jackfruit Chips', 'Murukku', 'Mixture', 'Kuzhalappam', 'Pakkavada', 'Dates'] },
      { name: 'Biscuits & Chocolates', subcategories: ['Oreo', 'Britannia', 'KitKat', 'Nutella', 'Cadbury', 'Croissant', 'Cookies'] },
      { name: 'Tea, Coffee & Beverages', subcategories: ['Tea', 'Green Tea', 'Coffee', 'Instant Coffee', 'Health Drinks', 'Breakfast Cereals'] },
      { name: 'Fryums', subcategories: ['Pappadam', 'Vadam', 'Fryums'] },
    ]
  },
  {
    name: 'Frozen Foods',
    categories: [
      { name: 'Frozen Seafood', subcategories: [] },
      { name: 'Frozen Meat', subcategories: [] },
      { name: 'Frozen Vegetables', subcategories: [] },
      { name: 'Frozen Ready to Cook', subcategories: [] },
      { name: 'Frozen Snacks', subcategories: [] },
      { name: 'Frozen Desserts', subcategories: [] },
    ]
  },
  {
    name: 'Fresh Foods',
    categories: [
      { name: 'Fruits', subcategories: [] },
      { name: 'Vegetables', subcategories: [] },
      { name: 'Herbs', subcategories: [] },
    ]
  },
  {
    name: 'Dairy & Chilled',
    categories: [
      { name: 'Milk', subcategories: [] },
      { name: 'Curd & Yogurt', subcategories: [] },
      { name: 'Butter & Cream', subcategories: [] },
      { name: 'Paneer & Cheese', subcategories: [] },
    ]
  },
  {
    name: 'Bakery',
    categories: [
      { name: 'Bread', subcategories: [] },
      { name: 'Cakes', subcategories: [] },
      { name: 'Frozen Bakery', subcategories: [] },
    ]
  },
  {
    name: 'Household',
    categories: [
      { name: 'Laundry', subcategories: [] },
      { name: 'Cleaning', subcategories: [] },
      { name: 'Kitchen Essentials', subcategories: [] },
      { name: 'Air Fresheners', subcategories: [] },
    ]
  },
  {
    name: 'Personal Care',
    categories: [
      { name: 'Bath', subcategories: [] },
      { name: 'Hair Care', subcategories: [] },
      { name: 'Oral Care', subcategories: [] },
      { name: 'Skin Care', subcategories: [] },
      { name: 'Baby Care', subcategories: [] },
      { name: 'Feminine Care', subcategories: [] },
    ]
  }
];
