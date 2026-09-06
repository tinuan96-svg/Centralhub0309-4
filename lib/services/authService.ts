import { supabase } from '../supabase';

export const AuthService = {
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('Sign in error:', error);
      throw error;
    }

    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  },

  async getSession() {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('Get session error:', error.message);
        return null;
      }
      return data?.session ?? null;
    } catch (err) {
      console.error('Unexpected getSession error:', err);
      return null;
    }
  },

  async getUser() {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        if (error.message !== 'Auth session missing!') {
          console.error('Get user error:', error.message);
        }
        return null;
      }
      return data?.user ?? null;
    } catch (err) {
      console.error('Unexpected getUser error:', err);
      return null;
    }
  },

  onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange((event, session) => {
      (() => {
        callback(event, session);
      })();
    });
  },
};
