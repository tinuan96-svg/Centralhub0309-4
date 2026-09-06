import { supabase } from '../supabase';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  profile_role: 'admin' | 'user';
  is_active: boolean;
  created_at: string;
}

export const userService = {
  async getAllProfiles(): Promise<UserProfile[]> {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user profiles:', error);
      return [];
    }
    return data || [];
  },

  async updateProfile(id: string, updates: Partial<UserProfile>): Promise<boolean> {
    const { error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating profile:', error);
      return false;
    }
    return true;
  },

  async deleteProfile(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('user_profiles')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting profile:', error);
      return false;
    }
    return true;
  }
};
