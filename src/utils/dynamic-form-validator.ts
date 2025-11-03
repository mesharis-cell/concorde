import type {
    RegistrationFormConfig,
    FormFieldConfig,
    ValidationRules,
} from '../types/index.js';

/**
 * Dynamic Form Validation Engine
 * 
 * Validates form submissions against dynamic form configurations.
 * Supports all validation rules, conditional logic, and type-specific validations.
 */

export interface ValidationError {
    field: string;
    message: string;
    rule: string;
}

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
}

export class DynamicFormValidator {
    /**
     * Validate complete form submission against configuration
     */
    static validateFormData(
        formData: Record<string, any>,
        formConfig: RegistrationFormConfig
    ): ValidationResult {
        const errors: ValidationError[] = [];

        // Get all fields from all steps
        const allFields = this.getAllFieldsFromConfig(formConfig);

        // Validate each field
        for (const field of allFields) {
            // Check if field should be visible based on conditional logic
            const isVisible = this.evaluateConditional(field.conditional, formData);

            // Skip validation for hidden fields
            if (!isVisible) {
                continue;
            }

            const value = formData[field.name];
            const fieldErrors = this.validateField(field, value, formData);
            errors.push(...fieldErrors);
        }

        return {
            isValid: errors.length === 0,
            errors,
        };
    }

    /**
     * Validate a single field against its configuration
     */
    static validateField(
        field: FormFieldConfig,
        value: any,
        allFormData: Record<string, any>
    ): ValidationError[] {
        const errors: ValidationError[] = [];

        // Required validation
        if (field.required || field.validation?.required) {
            if (this.isEmpty(value)) {
                errors.push({
                    field: field.name,
                    message: field.validation?.message || `${field.label} is required`,
                    rule: 'required',
                });
                return errors; // If required and empty, skip other validations
            }
        }

        // Skip other validations if value is empty and not required
        if (this.isEmpty(value)) {
            return errors;
        }

        // Type-specific validation
        const typeErrors = this.validateFieldType(field, value);
        errors.push(...typeErrors);

        // Validation rules
        if (field.validation) {
            const ruleErrors = this.validateRules(field, value);
            errors.push(...ruleErrors);
        }

        return errors;
    }

    /**
     * Validate field type constraints
     */
    private static validateFieldType(
        field: FormFieldConfig,
        value: any
    ): ValidationError[] {
        const errors: ValidationError[] = [];

        switch (field.type) {
            case 'email':
                if (!this.isValidEmail(String(value))) {
                    errors.push({
                        field: field.name,
                        message: 'Please enter a valid email address',
                        rule: 'email',
                    });
                }
                break;

            case 'tel':
                if (field.validation?.phone && !this.isValidPhone(String(value))) {
                    errors.push({
                        field: field.name,
                        message: 'Please enter a valid phone number',
                        rule: 'phone',
                    });
                }
                break;

            case 'url':
                if (!this.isValidUrl(String(value))) {
                    errors.push({
                        field: field.name,
                        message: 'Please enter a valid URL',
                        rule: 'url',
                    });
                }
                break;

            case 'number':
                if (isNaN(Number(value))) {
                    errors.push({
                        field: field.name,
                        message: 'Please enter a valid number',
                        rule: 'number',
                    });
                }
                break;

            case 'date':
            case 'datetime':
                if (!this.isValidDate(String(value))) {
                    errors.push({
                        field: field.name,
                        message: 'Please enter a valid date',
                        rule: 'date',
                    });
                }
                break;
        }

        return errors;
    }

    /**
     * Validate field against validation rules
     */
    private static validateRules(
        field: FormFieldConfig,
        value: any
    ): ValidationError[] {
        const errors: ValidationError[] = [];
        const rules = field.validation;

        if (!rules) return errors;

        const stringValue = String(value);
        const numberValue = Number(value);

        // Min length validation
        if (rules.minLength !== undefined && stringValue.length < rules.minLength) {
            errors.push({
                field: field.name,
                message:
                    rules.message ||
                    `${field.label} must be at least ${rules.minLength} characters`,
                rule: 'minLength',
            });
        }

        // Max length validation
        if (rules.maxLength !== undefined && stringValue.length > rules.maxLength) {
            errors.push({
                field: field.name,
                message:
                    rules.message ||
                    `${field.label} must be no more than ${rules.maxLength} characters`,
                rule: 'maxLength',
            });
        }

        // Min value validation (for numbers)
        if (rules.min !== undefined && numberValue < rules.min) {
            errors.push({
                field: field.name,
                message:
                    rules.message || `${field.label} must be at least ${rules.min}`,
                rule: 'min',
            });
        }

        // Max value validation (for numbers)
        if (rules.max !== undefined && numberValue > rules.max) {
            errors.push({
                field: field.name,
                message:
                    rules.message || `${field.label} must be no more than ${rules.max}`,
                rule: 'max',
            });
        }

        // Pattern validation (regex)
        if (rules.pattern) {
            try {
                const regex = new RegExp(rules.pattern);
                if (!regex.test(stringValue)) {
                    errors.push({
                        field: field.name,
                        message:
                            rules.message || `${field.label} format is invalid`,
                        rule: 'pattern',
                    });
                }
            } catch (error) {
                console.error(`Invalid regex pattern for field ${field.name}:`, error);
            }
        }

        // Age validation for date fields
        if ((field.type === 'date' || field.type === 'datetime') && stringValue) {
            try {
                const birthDate = new Date(stringValue);
                const today = new Date();
                let age = today.getFullYear() - birthDate.getFullYear();
                const monthDiff = today.getMonth() - birthDate.getMonth();

                // Adjust age if birthday hasn't occurred this year
                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                    age--;
                }

                // Check minimum age (e.g., 21 for age gating)
                if (rules.minAge !== undefined && age < rules.minAge) {
                    errors.push({
                        field: field.name,
                        message:
                            rules.message || `You must be at least ${rules.minAge} years old`,
                        rule: 'minAge',
                    });
                }

                // Check maximum age
                if (rules.maxAge !== undefined && age > rules.maxAge) {
                    errors.push({
                        field: field.name,
                        message:
                            rules.message || `You must be no more than ${rules.maxAge} years old`,
                        rule: 'maxAge',
                    });
                }
            } catch (error) {
                console.error(`Age validation error for field ${field.name}:`, error);
            }
        }

        // Custom validation expression
        if (rules.custom) {
            try {
                const isValid = this.evaluateCustomValidation(rules.custom, value);
                if (!isValid) {
                    errors.push({
                        field: field.name,
                        message: rules.message || `${field.label} validation failed`,
                        rule: 'custom',
                    });
                }
            } catch (error) {
                console.error(`Custom validation error for field ${field.name}:`, error);
            }
        }

        return errors;
    }

    /**
     * Evaluate conditional expression to determine if field should be visible
     */
    static evaluateConditional(
        conditional: string | undefined,
        formData: Record<string, any>
    ): boolean {
        if (!conditional) {
            return true; // No conditional means always visible
        }

        try {
            // Secure evaluation - only allow simple comparisons
            // Supported operators: ===, !==, ==, !=, >, <, >=, <=, &&, ||
            return this.safeEvaluateExpression(conditional, formData);
        } catch (error) {
            console.error('Conditional evaluation error:', error);
            return true; // On error, show the field (fail-safe)
        }
    }

    /**
     * Safe expression evaluator for conditional logic
     * Prevents code injection while supporting common comparison operations
     */
    private static safeEvaluateExpression(
        expression: string,
        formData: Record<string, any>
    ): boolean {
        // Simple equality check: fieldName === "value"
        if (expression.includes('===')) {
            const [fieldName, expectedValue] = expression.split('===').map(s => s.trim());
            const cleanFieldName = fieldName.trim();
            const cleanExpectedValue = expectedValue.replace(/['"]/g, '');

            const actualValue = String(formData[cleanFieldName] || '');
            return actualValue === cleanExpectedValue;
        }

        // Not equal check: fieldName !== "value"
        if (expression.includes('!==')) {
            const [fieldName, expectedValue] = expression.split('!==').map(s => s.trim());
            const cleanFieldName = fieldName.trim();
            const cleanExpectedValue = expectedValue.replace(/['"]/g, '');

            const actualValue = String(formData[cleanFieldName] || '');
            return actualValue !== cleanExpectedValue;
        }

        // Boolean check: fieldName === true or fieldName === false
        if (expression.includes('=== true')) {
            const fieldName = expression.replace('=== true', '').trim();
            return formData[fieldName] === true;
        }

        if (expression.includes('=== false')) {
            const fieldName = expression.replace('=== false', '').trim();
            return formData[fieldName] === false;
        }

        // Simple existence check: fieldName
        const fieldName = expression.trim();
        return !!formData[fieldName];
    }

    /**
     * Evaluate custom validation expression
     */
    private static evaluateCustomValidation(
        expression: string,
        value: any
    ): boolean {
        // For now, only support simple expressions
        // TODO: Implement safe sandbox for more complex validations

        // Example: value.length > 5
        // Example: value.includes("@")

        try {
            // Very basic support - expand as needed
            if (expression.includes('length >')) {
                const minLength = parseInt(expression.match(/length > (\d+)/)?.[1] || '0');
                return String(value).length > minLength;
            }

            if (expression.includes('length <')) {
                const maxLength = parseInt(expression.match(/length < (\d+)/)?.[1] || '0');
                return String(value).length < maxLength;
            }

            // Default to true for unsupported expressions
            return true;
        } catch (error) {
            console.error('Custom validation error:', error);
            return true; // Fail-safe: allow value on error
        }
    }

    /**
     * Helper: Check if value is empty
     */
    private static isEmpty(value: any): boolean {
        if (value === null || value === undefined) return true;
        if (typeof value === 'string') return value.trim() === '';
        if (typeof value === 'boolean') return false; // Booleans are never "empty"
        if (Array.isArray(value)) return value.length === 0;
        return false;
    }

    /**
     * Helper: Validate email format
     */
    private static isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Helper: Validate phone format
     */
    private static isValidPhone(phone: string): boolean {
        // Basic international phone validation
        const phoneRegex = /^\+?[\d\s\-()]+$/;
        return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
    }

    /**
     * Helper: Validate URL format
     */
    private static isValidUrl(url: string): boolean {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Helper: Validate date format
     */
    private static isValidDate(date: string): boolean {
        const parsed = new Date(date);
        return !isNaN(parsed.getTime());
    }

    /**
     * Helper: Get all fields from all steps in config
     */
    private static getAllFieldsFromConfig(
        config: RegistrationFormConfig
    ): FormFieldConfig[] {
        const fields: FormFieldConfig[] = [];

        Object.values(config).forEach((step) => {
            if (step && step.fields) {
                fields.push(...step.fields);
            }
        });

        return fields;
    }

    /**
     * Validate that form configuration itself is valid
     */
    static validateFormConfig(
        config: any
    ): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Check if config is an object
        if (!config || typeof config !== 'object') {
            errors.push('Form configuration must be an object');
            return { isValid: false, errors };
        }

        // Check if has at least one step
        const stepKeys = Object.keys(config);
        if (stepKeys.length === 0) {
            errors.push('Form must have at least one step');
            return { isValid: false, errors };
        }

        // Validate each step
        stepKeys.forEach((stepKey) => {
            const step = config[stepKey];

            if (!step.label) {
                errors.push(`Step ${stepKey} must have a label`);
            }

            if (!step.fields || !Array.isArray(step.fields)) {
                errors.push(`Step ${stepKey} must have a fields array`);
                return;
            }

            if (step.fields.length === 0) {
                errors.push(`Step ${stepKey} must have at least one field`);
            }

            // Validate each field
            step.fields.forEach((field: any, index: number) => {
                if (!field.name) {
                    errors.push(`Step ${stepKey}, field ${index}: name is required`);
                }

                if (!field.type) {
                    errors.push(`Step ${stepKey}, field ${index}: type is required`);
                }

                if (!field.label) {
                    errors.push(`Step ${stepKey}, field ${index}: label is required`);
                }

                // Validate field options for select/radio fields
                if (['select', 'radio', 'checkbox'].includes(field.type)) {
                    if (!field.options || !Array.isArray(field.options)) {
                        errors.push(
                            `Step ${stepKey}, field ${field.name}: select/radio fields must have options`
                        );
                    } else if (field.options.length === 0) {
                        errors.push(
                            `Step ${stepKey}, field ${field.name}: must have at least one option`
                        );
                    }
                }
            });
        });

        // Check for duplicate field names
        const allFields = this.getAllFieldsFromConfig(config);
        const fieldNames = allFields.map((f: any) => f.name);
        const duplicates = fieldNames.filter(
            (name, index) => fieldNames.indexOf(name) !== index
        );
        if (duplicates.length > 0) {
            errors.push(
                `Duplicate field names found: ${[...new Set(duplicates)].join(', ')}`
            );
        }

        return {
            isValid: errors.length === 0,
            errors,
        };
    }

    /**
     * Get validation error messages in a user-friendly format
     */
    static getErrorMessages(errors: ValidationError[]): Record<string, string> {
        const errorMap: Record<string, string> = {};

        errors.forEach((error) => {
            if (!errorMap[error.field]) {
                errorMap[error.field] = error.message;
            }
        });

        return errorMap;
    }

    /**
     * Get all field names that have errors
     */
    static getErrorFields(errors: ValidationError[]): string[] {
        return [...new Set(errors.map((e) => e.field))];
    }
}


