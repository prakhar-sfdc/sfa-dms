import { LightningElement, wire, track, api } from 'lwc';
import { getRecord } from 'lightning/uiRecordApi';
import getOrderItems from '@salesforce/apex/FinancialAdjustmentController.getOrderItems';
import createAdjustmentHeader from '@salesforce/apex/FinancialAdjustmentController.createAdjustmentHeader';
import createAdjustmentLines from '@salesforce/apex/FinancialAdjustmentController.createAdjustmentLines';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

const FIELDS = ['Order.AccountId'];

export default class FinancialAdjustmentWizard extends LightningElement {

    @api recordId;

    accountId;
    adjustmentId;

    @track currentStep = 1;
    @track orderItems = [];

    type;
    reason;
    subReason;
    description;
    invoiceId;

    @track reasonOptions = [];
    @track subReasonOptions = [];

    typeOptions = [
        { label: 'Credit Note', value: 'Credit Note' },
        { label: 'Debit Note', value: 'Debit Note' }
    ];

    reasonMap = {
        'Credit Note': [
            'Return / Damage',
            'Invoice Overcharge',
            'Discount Adjustment',
            'Scheme Adjustment',
            'Quality Issue',
            'Order Cancellation',
            'Other Credit'
        ],
        'Debit Note': [
            'Underbilling',
            'Extra Delivery',
            'Pricing Error',
            'Additional Charges',
            'Tax Adjustment',
            'Penalty / Late Fee',
            'Other Debit'
        ]
    };

    subReasonMap = {
        'Return / Damage': ['Damaged Goods', 'Expired Product', 'Wrong Product'],
        'Invoice Overcharge': ['Incorrect Pricing', 'Duplicate Charge'],
        'Discount Adjustment': ['Discount Not Applied', 'Wrong Discount'],
        'Scheme Adjustment': ['Scheme Missed', 'Incentive Not Given'],
        'Quality Issue': ['Product Quality Issue', 'Damaged at Source'],
        'Order Cancellation': ['Order Cancelled After Billing'],
        'Underbilling': ['Missing Item Billing', 'Quantity Underbilled'],
        'Extra Delivery': ['Extra Quantity Delivered', 'Free Item Charged Later'],
        'Pricing Error': ['Incorrect Price Applied', 'Old Price Used'],
        'Additional Charges': ['Transport Charges', 'Handling Charges'],
        'Tax Adjustment': ['GST Mismatch', 'Tax Calculation Error'],
        'Penalty / Late Fee': ['Late Payment Penalty']
    };

    // ✅ Wire handles accountId + triggers fetchOrderItems
    @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
    orderHandler({ data, error }) {
        if (data) {
            this.accountId = data.fields.AccountId.value;
            this.fetchOrderItems();
        }
        if (error) {
            this.showToast('Error', 'Failed to load order record', 'error');
        }
    }

    fetchOrderItems() {
        if (!this.recordId) return;

        getOrderItems({ orderId: this.recordId })
            .then(data => {
                console.log('Raw order items from Apex:', JSON.stringify(data));

                this.orderItems = data.map(item => ({
                    Id: item.orderItemId,
                    productId: item.productId,
                    productName: item.productName,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    adjustQty: 0
                }));

                console.log('Mapped orderItems:', JSON.stringify(this.orderItems));
            })
            .catch(error => {
                this.showToast('Error', error.body?.message || 'Failed to load order items', 'error');
            });
    }

    get isStep1() {
        return this.currentStep === 1;
    }

    get isStep2() {
        return this.currentStep === 2;
    }

    handleTypeChange(e) {
        this.type = e.detail.value;
        this.reasonOptions = (this.reasonMap[this.type] || []).map(r => ({
            label: r,
            value: r
        }));
        this.reason = null;
        this.subReason = null;
        this.subReasonOptions = [];
    }

    handleReasonChange(e) {
        this.reason = e.detail.value;
        this.subReasonOptions = (this.subReasonMap[this.reason] || []).map(s => ({
            label: s,
            value: s
        }));
        this.subReason = null;
    }

    handleSubReasonChange(e) {
        this.subReason = e.detail.value;
    }

    handleDescriptionChange(e) {
        this.description = e.detail.value;
    }

    handleInvoiceChange(e) {
        this.invoiceId = e.detail.recordId;
    }

    handleNext() {
        if (!this.type || !this.invoiceId || !this.reason) {
            this.showToast('Error', 'Fill all required fields', 'error');
            return;
        }

        const adj = {
            Type__c: this.type,
            Reason__c: this.reason,
            Sub_Reasons__c: this.subReason,
            Description__c: this.description,
            Order_Invoice__c: this.invoiceId,
            Order__c: this.recordId,
            Account__c: this.accountId,
            Status__c: 'Draft',
            Issue_Date__c: new Date().toISOString().split('T')[0]
        };

        createAdjustmentHeader({ adj })
            .then(result => {
                this.adjustmentId = result;
                this.currentStep = 2;
            })
            .catch(error => {
                this.showToast('Error', error.body?.message || 'Failed to create adjustment', 'error');
            });
    }

    handleBack() {
        this.currentStep = 1;
    }

    // ✅ Fixed reactivity with array spread
    handleQtyChange(event) {
        const index = parseInt(event.target.dataset.index);
        const value = parseFloat(event.target.value) || 0;

        if (value > this.orderItems[index].quantity) {
            this.showToast('Error', 'Qty cannot exceed ordered qty', 'error');
            event.target.value = this.orderItems[index].adjustQty;
            return;
        }

        const updated = [...this.orderItems];
        updated[index] = { ...updated[index], adjustQty: value };
        this.orderItems = updated;
    }

    // ✅ Sending lines as JSON string for reliable Apex deserialization
    handleSave() {
        const lines = this.orderItems
            .filter(i => i.adjustQty > 0)
            .map(i => ({
                productId: i.productId,
                quantity: i.adjustQty,
                unitPrice: i.unitPrice
            }));

        console.log('Lines to save:', JSON.stringify(lines));

        if (lines.length === 0) {
            this.showToast('Error', 'Enter at least one quantity', 'error');
            return;
        }

        createAdjustmentLines({
            adjId: this.adjustmentId,
            linesJson: JSON.stringify(lines)  // ✅ JSON string for safe passing
        })
            .then(() => {
                this.showToast('Success', 'Adjustment Created Successfully', 'success');
                this.closeAction();
            })
            .catch(error => {
                this.showToast('Error', error.body?.message || 'Failed to save adjustment lines', 'error');
            });
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    closeAction() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    
}