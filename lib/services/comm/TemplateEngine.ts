/**
 * TemplateEngine handles safe variable interpolation for communication templates.
 * Supports {{variable}} syntax.
 */
export class TemplateEngine {
  /**
   * Render a template with provided variables.
   * Replaces {{variable_name}} with values from the variables object.
   */
  static render(template: string, variables: Record<string, any>): string {
    if (!template) return '';

    return template.replace(/\{\{\s*([\w\.]+)\s*\}\}/g, (match, key) => {
      const value = variables[key];

      if (value === undefined || value === null) {
        console.warn(`[TemplateEngine] Missing variable: ${key}`);
        return match; // Keep the placeholder if variable is missing
      }

      return String(value);
    });
  }

  /**
   * Extract all variable names from a template string.
   */
  static extractVariables(template: string): string[] {
    const matches = template.matchAll(/\{\{\s*([\w\.]+)\s*\}\}/g);
    const variables = new Set<string>();

    for (const match of matches) {
      variables.add(match[1]);
    }

    return Array.from(variables);
  }

  /**
   * Validate that all required variables are present in the provided object.
   */
  static validate(template: string, variables: Record<string, any>): { valid: boolean; missing: string[] } {
    const required = this.extractVariables(template);
    const missing = required.filter(v => variables[v] === undefined || variables[v] === null);

    return {
      valid: missing.length === 0,
      missing
    };
  }
}
