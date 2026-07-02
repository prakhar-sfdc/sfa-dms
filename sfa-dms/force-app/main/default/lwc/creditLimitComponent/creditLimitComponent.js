import { LightningElement, wire } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import getDealerCreditData from '@salesforce/apex/DealerCreditComponent.getDealerCreditData';

export default class CreditLimitCard extends LightningElement {

    recordId;

    sanctionedLimit = 0;
    utilizedLimit = 0;
    availableLimit = 0;

    creditStatus = 'Healthy';
    topProduct = '';

    // ✅ Get recordId from URL
    @wire(CurrentPageReference)
    getStateParameters(currentPageReference) {
        if (currentPageReference) {
            this.recordId = currentPageReference.state?.recordId 
                         || currentPageReference.attributes?.recordId;

            console.log('Record Id:', this.recordId);
        }
    }

    // 🔹 Fetch Data ONLY when recordId is available
    @wire(getDealerCreditData, { accountId: '$recordId' })
    wiredData({ data, error }) {
        if (data) {
            console.log('Data:', JSON.stringify(data));

            this.sanctionedLimit = data.creditLimit || 0;
            this.utilizedLimit = data.utilized || 0;
            this.availableLimit = this.sanctionedLimit - this.utilizedLimit;
            this.topProduct = data.topProduct;

            // Status logic
            if (this.availableLimit < 0) {
                this.creditStatus = 'Over Limit';
            } else if (this.availableLimit < this.sanctionedLimit * 0.2) {
                this.creditStatus = 'Critical';
            } else {
                this.creditStatus = 'Healthy';
            }

        } else if (error) {
            console.error('Error:', error);
        }
    }

    // 🔹 Currency Formatter (Indian format)
    formatCurrency(value) {
        if (!value && value !== 0) return '0';
        let numStr = String(Math.round(value));
        let lastThree = numStr.slice(-3);
        let otherDigits = numStr.slice(0, -3);

        if (otherDigits) {
            return otherDigits.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
        }
        return lastThree;
    }

    get sanctionedLimitDisplay() {
        return this.formatCurrency(this.sanctionedLimit);
    }

    get utilizedLimitDisplay() {
        return this.formatCurrency(this.utilizedLimit);
    }

    get availableLimitDisplay() {
        return this.formatCurrency(this.availableLimit);
    }
}