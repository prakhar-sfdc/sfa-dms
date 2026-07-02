import { LightningElement, wire, track, api } from 'lwc';
import { CurrentPageReference }              from 'lightning/navigation';
import { ShowToastEvent }                    from 'lightning/platformShowToastEvent';
import { refreshApex }                       from '@salesforce/apex';
import getSubOrderDetails                    from '@salesforce/apex/SubOrderTrackerController.getSubOrderDetails';
import submitTransaction                     from '@salesforce/apex/SubOrderTrackerController.submitTransaction';

// ─── Status configuration map ───────────────────────────────────────────────
const STATUS_CONFIG = {
    Processing: {
        label:         'Processing',
        formIcon:      '🚚',
        formTitle:     'Dispatch Sub Order',
        quantityLabel: 'Loaded Quantity',
        buttonLabel:   'Mark as Dispatched',
        btnIcon:       '✈️',
        nextStatus:    'Dispatched',
        color:         '#F59E0B',
        requiresExact: true
    },
    Dispatched: {
        label:         'Dispatched',
        formIcon:      '📬',
        formTitle:     'Confirm Delivery',
        quantityLabel: 'Delivered Quantity',
        buttonLabel:   'Mark as Delivered',
        btnIcon:       '✅',
        nextStatus:    'Delivered',
        color:         '#3B82F6',
        requiresExact: true
    },
    Delivered: {
        label:         'Delivered',
        formIcon:      '↩️',
        formTitle:     'Record Return',
        quantityLabel: 'Returned Quantity',
        buttonLabel:   'Mark as Returned',
        btnIcon:       '↩️',
        nextStatus:    'Returned',
        color:         '#8B5CF6',
        requiresExact: false
    },
    Returned: {
        label:  'Returned',
        color:  '#10B981'
    }
};

const STEPS = [
    { id: 'Processing', label: 'Processing', icon: '📋' },
    { id: 'Dispatched', label: 'Dispatched', icon: '🚚' },
    { id: 'Delivered',  label: 'Delivered',  icon: '📬' },
    { id: 'Returned',   label: 'Returned',   icon: '✅' }
];

const STATUS_ORDER = ['Processing', 'Dispatched', 'Delivered', 'Returned'];

// ─── Component ───────────────────────────────────────────────────────────────
export default class SubOrderTracker extends LightningElement {

    // ── Public props ──
    @api recordId;

    // ── Internal state ──
    @track subOrderId    = undefined;   // undefined prevents wire firing until set
    @track subOrder;
    @track products      = [];
    @track transactions  = [];
    @track totalQuantity = 0;

    @track quantityInput    = '';
    @track remarks          = '';
    @track uploadedDocId    = null;
    @track uploadedFileName = null;

    @track isLoading    = true;
    @track isSubmitting = false;
    @track errorMessage = null;

    _wiredResult;

    // ─────────────────────────────────────────────────────────────────────────
    // Page Reference — resolve Sub Order ID from multiple possible sources
    //
    // Experience Cloud record-detail URL format:
    //   /s/sub-order/Sub_Order__c/{recordId}
    //   pageRef.type       = 'standard__recordPage'
    //   pageRef.attributes = { recordId, objectApiName, actionName }
    //
    // Also supports:
    //   Query param : ?c__subOrderId=xxx  → pageRef.state.c__subOrderId
    //   @api prop   : recordId            → set by parent / App Builder
    // ─────────────────────────────────────────────────────────────────────────
    @wire(CurrentPageReference)
    handlePageRef(pageRef) {
        if (!pageRef) return;

        const attrs = pageRef.attributes || {};
        const state = pageRef.state      || {};

        const resolvedId =
            attrs.recordId       ||   // standard__recordPage  ← your URL format
            state.c__subOrderId  ||   // custom query param
            state.subOrderId     ||   // alternate query param
            this.recordId        ||   // @api prop from parent / App Builder
            null;

        if (resolvedId) {
            this.subOrderId   = resolvedId;
            this.errorMessage = null;
        } else {
            this.isLoading    = false;
            this.errorMessage = 'No Sub Order ID found. Ensure the page URL contains the record ID.';
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Wire — load sub order data
    // Only fires once subOrderId is a non-undefined string
    // ─────────────────────────────────────────────────────────────────────────
    @wire(getSubOrderDetails, { subOrderId: '$subOrderId' })
    wiredSubOrder(result) {
        this._wiredResult = result;
        this.isLoading    = false;

        if (result.data && result.data.subOrder) {
            this.errorMessage  = null;
            this.subOrder      = result.data.subOrder;
            this.products      = result.data.products;
            this.totalQuantity = result.data.totalQuantity || 0;

            // Enrich transactions with display helpers
            this.transactions = (result.data.transactions || []).map(txn => ({
                ...txn,
                formattedDate: this._formatDate(txn.Transaction_Date__c),
                videoUrl: txn.Video_Attachment_Id__c
                    ? `/sfc/servlet.shepherd/document/download/${txn.Video_Attachment_Id__c}`
                    : null,
                icon: { Dispatch: '🚚', Delivery: '📬', Return: '↩️' }[txn.Transaction_Type__c] || '📌',
                badgeCls: `sot-txn-badge sot-txn-${(txn.Transaction_Type__c || '').toLowerCase()}`,
                nodeCls:  `sot-timeline-node-icon sot-node-${(txn.Transaction_Type__c || '').toLowerCase()}`
            }));

            // Reset form state when status changes
            this.quantityInput    = '';
            this.remarks          = '';
            this.uploadedDocId    = null;
            this.uploadedFileName = null;

        } else if (result.error) {
            this.errorMessage = result.error?.body?.message || 'Failed to load sub order.';
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Computed — status config
    // ─────────────────────────────────────────────────────────────────────────
    get statusConfig() {
        const status = this.subOrder?.Status__c || 'Processing';
        return STATUS_CONFIG[status] || STATUS_CONFIG.Processing;
    }

    get isProcessing() { return this.subOrder?.Status__c === 'Processing'; }
    get isDispatched() { return this.subOrder?.Status__c === 'Dispatched'; }
    get isDelivered()  { return this.subOrder?.Status__c === 'Delivered';  }
    get isReturned()   { return this.subOrder?.Status__c === 'Returned';   }

    get hasTransactions()  { return this.transactions && this.transactions.length > 0; }
    get transactionCount() { return this.transactions?.length || 0; }

    get formattedDate() {
        return this._formatDate(this.subOrder?.Order_Date__c);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Computed — Stepper steps with CSS classes
    // ─────────────────────────────────────────────────────────────────────────
    get steps() {
        const currentIdx = STATUS_ORDER.indexOf(this.subOrder?.Status__c || 'Processing');
        return STEPS.map((s, i) => ({
            ...s,
            cls: [
                'sot-step',
                i < currentIdx   ? 'sot-step--done'     : '',
                i === currentIdx ? 'sot-step--active'   : '',
                i > currentIdx   ? 'sot-step--upcoming' : ''
            ].filter(Boolean).join(' ')
        }));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Computed — header / form classes and styles
    // ─────────────────────────────────────────────────────────────────────────
    get headerClass() {
        const status = (this.subOrder?.Status__c || 'Processing').toLowerCase();
        return `sot-header sot-header--${status}`;
    }

    get formCardClass() {
        const status = (this.subOrder?.Status__c || 'Processing').toLowerCase();
        return `sot-card sot-form-card sot-form--${status}`;
    }

    get chipStyle() {
        const color = this.statusConfig.color || '#64748B';
        return `background: ${color}22; color: ${color}; border: 1.5px solid ${color}55;`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Computed — Quantity validation
    // ─────────────────────────────────────────────────────────────────────────
    get parsedQty() {
        const v = parseFloat(this.quantityInput);
        return isNaN(v) ? null : v;
    }

    get quantityMatch() {
        if (this.parsedQty === null) return false;
        if (!this.statusConfig.requiresExact) return false;
        return this.parsedQty === this.totalQuantity;
    }

    get showQuantityError() {
        if (this.parsedQty === null) return false;
        if (!this.statusConfig.requiresExact) return false;
        return this.parsedQty !== this.totalQuantity;
    }

    get showReturnQtyError() {
        if (!this.isDelivered) return false;
        if (this.parsedQty === null) return false;
        return this.parsedQty > this.totalQuantity;
    }

    get quantityInputClass() {
        const base = 'sot-qty-input';
        if (this.parsedQty === null || this.quantityInput === '') return base;
        if (this.showQuantityError || this.showReturnQtyError) return base + ' sot-input--error';
        if (this.quantityMatch || (this.isDelivered && this.parsedQty > 0 && !this.showReturnQtyError))
            return base + ' sot-input--success';
        return base;
    }

    get isSubmitDisabled() {
        if (this.isSubmitting) return true;
        if (!this.uploadedDocId) return true;
        if (this.parsedQty === null || this.parsedQty <= 0) return true;
        if (this.statusConfig.requiresExact && this.parsedQty !== this.totalQuantity) return true;
        if (this.isDelivered && this.parsedQty > this.totalQuantity) return true;
        return false;
    }

    get submitBtnClass() {
        return this.isSubmitDisabled
            ? 'sot-btn sot-btn--submit sot-btn--disabled'
            : 'sot-btn sot-btn--submit sot-btn--enabled';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Handlers
    // ─────────────────────────────────────────────────────────────────────────
    handleQuantityChange(event) {
        this.quantityInput = event.target.value;
    }

    handleRemarksChange(event) {
        this.remarks = event.target.value;
    }

    handleUploadFinished(event) {
        const files = event.detail.files;
        if (files && files.length > 0) {
            this.uploadedDocId    = files[0].contentDocumentId;
            this.uploadedFileName = files[0].name;
            this._toast('Video Uploaded', `"${files[0].name}" attached successfully.`, 'success');
        }
    }

    clearError() {
        this.errorMessage = null;
    }

    async handleSubmit() {
        if (this.isSubmitDisabled) return;

        this.isSubmitting = true;
        this.errorMessage = null;

        const input = {
            subOrderId:        this.subOrderId,
            currentStatus:     this.subOrder.Status__c,
            quantity:          this.parsedQty,
            contentDocumentId: this.uploadedDocId,
            remarks:           this.remarks || ''
        };

        try {
            const newStatus = await submitTransaction({ input });
            this._toast(
                'Status Updated ✅',
                `Sub order moved to "${newStatus}" successfully.`,
                'success'
            );
            await refreshApex(this._wiredResult);
        } catch (error) {
            const msg = error?.body?.message || 'An error occurred. Please try again.';
            this.errorMessage = msg;
            this._toast('Submission Failed', msg, 'error');
        } finally {
            this.isSubmitting = false;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────
    _toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    _formatDate(dateStr) {
        if (!dateStr) return '—';
        try {
            return new Date(dateStr).toLocaleDateString('en-IN', {
                day:   '2-digit',
                month: 'short',
                year:  'numeric'
            });
        } catch {
            return dateStr;
        }
    }
}