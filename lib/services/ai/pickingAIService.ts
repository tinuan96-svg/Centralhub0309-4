import { supabase } from '../../supabase';

export interface PickingAIResponse {
  action: 'PICK' | 'NEXT' | 'BACK' | 'REPEAT' | 'PAUSE' | 'RESUME' | 'FINISH' | 'UPDATE_STOCK' | 'UPDATE_LOCATION' | 'UNKNOWN';
  message: string;
  value?: string | number;
}

export class PickingAIService {
  static async processCommand(command: string, context: string): Promise<PickingAIResponse> {
    try {
      const { data, error } = await supabase.functions.invoke('picking-ai-assistant', {
        body: { command, context }
      });

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('AI Processing Error:', err);
      return { action: 'UNKNOWN', message: "I'm sorry, I couldn't understand that." };
    }
  }
}
