import { LightningElement, track } from 'lwc';
import getFieldSet from '@salesforce/apex/OrderFormController.getFieldSet';
import createOrder from '@salesforce/apex/OrderFormController.createOrder';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class DynamicOrderForm extends LightningElement {

    @track isStep1 = true;
    @track isStep2 = false;

    @track selectedRecordType;
    @track fields = [];
    formData = {};

    recordTypeOptions = [
        { label: 'Primary', value: 'Primary' },
        { label: 'Secondary', value: 'Secondary' }
    ];

    // ================= STEP 1 =================
    handleRecordTypeChange(event) {
        this.selectedRecordType = event.detail.value;
    }

    goToStep2() {

        if (!this.selectedRecordType) {
            this.showToast('Error', 'Select Record Type', 'error');
            return;
        }

        this.isStep1 = false;
        this.isStep2 = true;

        // 🔥 Fetch Field Set
 getFieldSet({ recordType: this.selectedRecordType })
.then(res => {
    console.log('FIELDS FROM APEX:', JSON.stringify(res));

     this.fields = res.map(f => {

                const type = (f.type || '').toLowerCase();

                return {
                    ...f,

                    isAccount: f.apiName === 'AccountId',

                    isPicklist: type === 'picklist',
                    isDate: type === 'date',
                    isDateTime: type === 'datetime',

                    isNumber: type === 'double' || type === 'integer' || type === 'currency',

                    isBoolean: type === 'boolean',

                    isText: type === 'string',
                    isTextarea: type === 'textarea'
                };
            });

    console.log('MAPPED FIELDS:', JSON.stringify(this.fields));
});
    }

    goBack() {
        this.isStep1 = true;
        this.isStep2 = false;
    }

    // ================= HANDLE INPUT =================
    handleChange(event) {
        const field = event.target.dataset.field;
        this.formData[field] = event.target.value;
    }

    handleAccountChange(event) {
        this.formData['AccountId'] = event.detail.selectedRecordId;
    }

    handleCheckboxChange(event) {
        const field = event.target.dataset.field;
        this.formData[field] = event.target.checked;
    }

    get isSecondary() {
        return this.selectedRecordType === 'Secondary';
    }

    // ================= SAVE =================
    handleSave() {

        createOrder({
            recordType: this.selectedRecordType,
            data: JSON.stringify(this.formData)
        })
            .then(() => {
                this.showToast('Success', 'Order Created', 'success');
                this.goBack();
            })
            .catch(error => {
                this.showToast('Error', error.body?.message, 'error');
            });
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}