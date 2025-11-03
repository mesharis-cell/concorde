import type { RegistrationFormConfig } from '../types/index.js';

/**
 * Default Registration Form Configuration
 * 
 * This is a simplified 2-step form that includes:
 * - Step 1: Basic personal information + guest details
 * - Step 2: Dietary and merchandise requirements
 * 
 * This configuration is used as a fallback when an event doesn't have
 * a custom form configuration defined.
 */
export const DEFAULT_REGISTRATION_FORM_CONFIG: RegistrationFormConfig = {
    step1: {
        label: 'Personal Information',
        subLabel: 'Tell us about yourself',
        order: 1,
        fields: [
            {
                name: 'firstName',
                type: 'text',
                label: 'First Name',
                placeholder: 'Enter your first name',
                helperText: undefined,
                required: true,
                validation: {
                    required: true,
                    minLength: 2,
                    maxLength: 50,
                    message: 'First name must be between 2 and 50 characters',
                },
                conditional: undefined,
                options: undefined,
                defaultValue: undefined,
                order: 1,
                rows: undefined,
                multiple: undefined,
                accept: undefined,
                metadata: undefined,
            },
            {
                name: 'lastName',
                type: 'text',
                label: 'Last Name',
                placeholder: 'Enter your last name',
                helperText: undefined,
                required: true,
                validation: {
                    required: true,
                    minLength: 2,
                    maxLength: 50,
                    message: 'Last name must be between 2 and 50 characters',
                },
                conditional: undefined,
                options: undefined,
                defaultValue: undefined,
                order: 2,
                rows: undefined,
                multiple: undefined,
                accept: undefined,
                metadata: undefined,
            },
            {
                name: 'email',
                type: 'email',
                label: 'Email Address',
                placeholder: 'Enter your email address',
                helperText: 'We will use this email for all event communications',
                required: true,
                validation: {
                    required: true,
                    email: true,
                    message: 'Please enter a valid email address',
                },
                conditional: undefined,
                options: undefined,
                defaultValue: undefined,
                order: 3,
                rows: undefined,
                multiple: undefined,
                accept: undefined,
                metadata: undefined,
            },
            {
                name: 'initials',
                type: 'text',
                label: 'Preferred Initials',
                placeholder: 'e.g., J.D.',
                helperText: 'How would you like your initials to appear?',
                required: false,
                validation: {
                    required: false,
                    maxLength: 10,
                },
                conditional: undefined,
                options: undefined,
                defaultValue: undefined,
                order: 4,
                rows: undefined,
                multiple: undefined,
                accept: undefined,
                metadata: undefined,
            },
            {
                name: 'address',
                type: 'textarea',
                label: 'Delivery Address',
                placeholder: 'Enter your full address for delivery of event materials',
                helperText: "We'll use this address to send you any event materials or merchandise",
                required: true,
                validation: {
                    required: true,
                    minLength: 10,
                    maxLength: 500,
                    message: 'Please provide a complete address',
                },
                conditional: undefined,
                options: undefined,
                defaultValue: undefined,
                order: 5,
                rows: 3,
                multiple: undefined,
                accept: undefined,
                metadata: undefined,
            },
            {
                name: 'hasGuest',
                type: 'switch',
                label: 'Will you be bringing a guest?',
                placeholder: undefined,
                helperText: 'Toggle if you will be accompanied by a guest',
                required: false,
                validation: {
                    required: false,
                },
                conditional: undefined,
                options: undefined,
                defaultValue: false,
                order: 6,
                rows: undefined,
                multiple: undefined,
                accept: undefined,
                metadata: undefined,
            },
            {
                name: 'guestName',
                type: 'text',
                label: 'Guest Name',
                placeholder: "Enter your guest's full name",
                helperText: 'Please provide the full name of your guest',
                required: true,
                validation: {
                    required: true,
                    minLength: 2,
                    maxLength: 100,
                    message: 'Guest name is required when bringing a guest',
                },
                conditional: 'hasGuest === true', // Only show if hasGuest is true
                options: undefined,
                defaultValue: undefined,
                order: 7,
                rows: undefined,
                multiple: undefined,
                accept: undefined,
                metadata: undefined,
            },
        ],
    },
    step2: {
        label: 'Requirements',
        subLabel: 'Help us prepare for your arrival',
        order: 2,
        fields: [
            {
                name: 'dietaryRequirements',
                type: 'textarea',
                label: 'Dietary Requirements',
                placeholder: 'e.g., Vegetarian, Vegan, Gluten-free, Halal, Kosher, Allergies, etc.',
                helperText: 'Please let us know about any dietary restrictions, allergies, or food preferences',
                required: false,
                validation: {
                    required: false,
                    maxLength: 500,
                },
                conditional: undefined,
                options: undefined,
                defaultValue: undefined,
                order: 1,
                rows: 4,
                multiple: undefined,
                accept: undefined,
                metadata: undefined,
            },
            {
                name: 'merchandiseGender',
                type: 'select',
                label: 'Merchandise Gender',
                placeholder: 'Select gender for sizing',
                helperText: 'Select the gender sizing for your event merchandise',
                required: false,
                validation: {
                    required: false,
                },
                conditional: undefined,
                options: [
                    { value: '', label: 'Select Gender', disabled: false },
                    { value: 'Men', label: 'Men', disabled: false },
                    { value: 'Women', label: 'Women', disabled: false },
                ],
                defaultValue: '',
                order: 2,
                rows: undefined,
                multiple: false,
                accept: undefined,
                metadata: undefined,
            },
            {
                name: 'merchandiseSize',
                type: 'select',
                label: 'Merchandise Size',
                placeholder: 'Select your size',
                helperText: 'Select your preferred size for event merchandise',
                required: false,
                validation: {
                    required: false,
                },
                conditional: "merchandiseGender !== ''", // Only show if gender is selected
                options: [
                    { value: '', label: 'Select Size', disabled: false },
                    { value: 'XS', label: 'Extra Small (XS)', disabled: false },
                    { value: 'S', label: 'Small (S)', disabled: false },
                    { value: 'M', label: 'Medium (M)', disabled: false },
                    { value: 'L', label: 'Large (L)', disabled: false },
                    { value: 'XL', label: 'Extra Large (XL)', disabled: false },
                ],
                defaultValue: '',
                order: 3,
                rows: undefined,
                multiple: false,
                accept: undefined,
                metadata: undefined,
            },
            {
                name: 'termsAccepted',
                type: 'checkbox',
                label: 'I accept the Terms and Conditions and Privacy Policy',
                helperText: 'Please review and accept our terms to complete your registration',
                required: true,
                validation: {
                    required: true,
                    message: 'You must accept the terms and conditions to proceed',
                },
                defaultValue: false,
                order: 4,
                rows: undefined,
                options: undefined,
                multiple: undefined,
                accept: undefined,
                metadata: undefined,
            },
        ],
    },
};

/**
 * Helper function to get form config for an event
 * Returns the event's custom config or falls back to the default
 */
export function getFormConfigOrDefault(eventFormConfig: any): RegistrationFormConfig {
    if (eventFormConfig && typeof eventFormConfig === 'object' && Object.keys(eventFormConfig).length > 0) {
        return eventFormConfig as RegistrationFormConfig;
    }
    return DEFAULT_REGISTRATION_FORM_CONFIG;
}


