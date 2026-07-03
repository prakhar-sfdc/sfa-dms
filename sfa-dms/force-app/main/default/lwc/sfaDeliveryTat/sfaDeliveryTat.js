import { LightningElement, api, wire } from 'lwc';
import { getRecord } from 'lightning/uiRecordApi';
import { CurrentPageReference } from 'lightning/navigation';

const FIELDS = ['Order.Estimated_Delivery_Date__c', 'Order.EffectiveDate'];

export default class SfaDeliveryTat extends LightningElement {
    @api recordId;

    schedule = new Date();
    created = new Date();
    totalDays = 0;
    elapsedDays = 0;
    remainingDays = 0;
    dashOffset = 0;
    displayDays = '';
    statusText = '';
    completionPercentage = 0;
    formattedCreatedDate = '';
    formattedScheduleDate = '';
    progressBarStyle = '';
    progressDotStyle = '';

    ringClass = 'progress-ring-fill';

    connectedCallback() {
        setInterval(() => {
            this.calculate();
        }, 60000);
    }

    @wire(CurrentPageReference)
    getStateParameters(currentPageReference) {
        if (currentPageReference) {
            this.recordId =
                currentPageReference.attributes?.recordId ||
                currentPageReference.state?.recordId;

            console.log('RecordId from URL:', this.recordId);
        }
    }

    @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
    wiredOrder({ data }) {
        if (data) {
            console.log('Dates',data.fields.Estimated_Delivery_Date__c.value);
            this.schedule = new Date(data.fields.Estimated_Delivery_Date__c.value);
            this.created = new Date(data.fields.EffectiveDate.value);
            this.totalDays = Math.ceil((this.schedule - this.created) / (1000*60*60*24));

            this.formattedCreatedDate = this.formatDate(this.created);
            this.formattedScheduleDate = this.formatDate(this.schedule);

            this.calculate();
        }
    }

    formatDate(date) {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    calculate() {
        const today = new Date();
        const totalDuration = this.schedule - this.created;
        const elapsedDuration = today - this.created;

        this.elapsedDays = Math.floor(elapsedDuration / (1000*60*60*24));
        this.remainingDays = Math.ceil((this.schedule - today) / (1000*60*60*24));

        let completion = (elapsedDuration / totalDuration) * 100;
        completion = Math.max(0, Math.min(completion, 100));
        this.completionPercentage = Math.round(completion);

        const progress = completion / 100;
        this.dashOffset = 534 - (534 * progress);

        this.updateProgressBar();
        this.updateDisplay();
    }

    updateProgressBar() {
        const barWidth = Math.max(0, Math.min(this.completionPercentage, 100));
        this.progressBarStyle = `width: ${barWidth}%`;

        const dotPosition = Math.max(0, Math.min(barWidth, 100));
        this.progressDotStyle = `left: ${dotPosition}%`;
    }

    updateDisplay() {
        if (this.remainingDays > 5) {
            this.ringClass = 'safe-ring';
            this.displayDays = `${this.remainingDays}`;
            this.statusText = 'Days Remaining';
        } else if (this.remainingDays > 2) {
            this.ringClass = 'warning-ring';
            this.displayDays = `${this.remainingDays}`;
            this.statusText = 'Days Remaining';
        } else if (this.remainingDays >= 0) {
            this.ringClass = 'critical-ring';
            this.displayDays = `${this.remainingDays}`;
            this.statusText = 'Days Remaining';
        } else {
            this.ringClass = 'overdue-ring';
            this.displayDays = `${Math.abs(this.remainingDays)}`;
            this.statusText = 'Days Overdue';
        }
    }
}
