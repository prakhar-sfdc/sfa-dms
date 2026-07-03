import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import createAccount from '@salesforce/apex/AccountOnboardingController.createAccount';

export default class SfaNewAccount extends LightningElement {

    @track showSuccessState = false;
    @track isSubmitting = false;
    @track formData = {
        businessName: '',
        accountType: '',
        gstin: '',
        contactPerson: '',
        phoneNumber: '',
        email: '',
        streetAddress: '',
        city: '',
        state: '',
        country: '',
        pincode: ''
    };
    @track errors = {};

    get showForm() {
        return !this.showSuccessState;
    }

    handleInputChange(event) {
        const field = event.target.name;
        const value = event.target.value;
        this.formData = { ...this.formData, [field]: value };
        if (this.errors[field]) {
            this.errors = { ...this.errors, [field]: '' };
        }
    }

    validateForm() {
        const newErrors = {};
        if (!this.formData.businessName.trim()) {
            newErrors.businessName = 'Business name is required';
        } else if (this.formData.businessName.length < 2) {
            newErrors.businessName = 'Business name must be at least 2 characters';
        }
        if (!this.formData.accountType) {
            newErrors.accountType = 'Please select an account type';
        }
        if (this.formData.gstin && !this.isValidGSTIN(this.formData.gstin)) {
            newErrors.gstin = 'Please enter a valid GSTIN format';
        }
        if (!this.formData.contactPerson.trim()) {
            newErrors.contactPerson = 'Contact person name is required';
        }
        if (!this.formData.phoneNumber.trim()) {
            newErrors.phoneNumber = 'Phone number is required';
        } else if (!this.isValidPhoneNumber(this.formData.phoneNumber)) {
            newErrors.phoneNumber = 'Please enter a valid phone number';
        }
        if (this.formData.email && !this.isValidEmail(this.formData.email)) {
            newErrors.email = 'Please enter a valid email address';
        }
        if (!this.formData.streetAddress.trim()) {
            newErrors.streetAddress = 'Street address is required';
        }
        if (!this.formData.city.trim()) {
            newErrors.city = 'City is required';
        }
        if (!this.formData.state.trim()) {
            newErrors.state = 'State is required';
        }
        if (!this.formData.pincode.trim()) {
            newErrors.pincode = 'Pincode is required';
        } else if (!this.isValidPincode(this.formData.pincode)) {
            newErrors.pincode = 'Please enter a valid pincode';
        }
        return newErrors;
    }

    isValidGSTIN(gstin) {
        const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
        return gstinRegex.test(gstin.toUpperCase());
    }

    isValidPhoneNumber(phone) {
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    isValidPincode(pincode) {
        const pincodeRegex = /^[1-9][0-9]{5}$/;
        return pincodeRegex.test(pincode);
    }

    async handleSubmit(event) {
        event.preventDefault();
        const validationErrors = this.validateForm();
        if (Object.keys(validationErrors).length > 0) {
            this.errors = validationErrors;
            return;
        }
        this.errors = {};
        this.isSubmitting = true;
        try {
            await createAccount({ data: this.formData });
            this.showSuccessState = true;
            this.dispatchEvent(new ShowToastEvent({
                title: 'Success',
                message: 'Account created successfully',
                variant: 'success'
            }));
        } catch (error) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error',
                message: error?.body?.message || error?.message || 'Failed to create account',
                variant: 'error'
            }));
        } finally {
            this.isSubmitting = false;
        }
    }

    createAnotherAccount() {
        this.formData = {
            businessName: '', accountType: '', gstin: '', contactPerson: '',
            phoneNumber: '', email: '', streetAddress: '', city: '', state: '', country: '', pincode: ''
        };
        this.errors = {};
        this.showSuccessState = false;
    }

    goToAccountDashboard() {
        this.dispatchEvent(new CustomEvent('navigate', { detail: { tab: 'account-360' }, bubbles: true }));
    }
}
