import { LightningElement, wire, track } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import getDealerSummary from '@salesforce/apex/DealerSummaryController.getDealerSummary';
import getDealerOrders from '@salesforce/apex/DealerSummaryController.getDealerOrders';
import getDealerPayments from '@salesforce/apex/DealerSummaryController.getDealerPayments';
import getDealerAdjustments from '@salesforce/apex/DealerSummaryController.getDealerAdjustments';
import getDealerCreditData from '@salesforce/apex/DealerCreditComponent.getDealerCreditData';

export default class Dealer360 extends LightningElement {

    @track recordId;

    // ── Dealer Summary (transaction cards) ───────────────
    @track summary;
    @track error;

    // ── Credit Limit data ─────────────────────────────────
    sanctionedLimit = 0;
    utilizedLimit   = 0;
    availableLimit  = 0;
    creditStatus    = 'Healthy';

    // ── Modal visibility ──────────────────────────────────
    @track showOrdersModal   = false;
    @track showPaymentsModal = false;
    @track showCreditModal   = false;
    @track showDebitModal    = false;

    // ── Detail data ───────────────────────────────────────
    @track orders;
    @track payments;
    @track creditNotes;
    @track debitNotes;

    // ── Loading states ────────────────────────────────────
    @track ordersLoading      = false;
    @track paymentsLoading    = false;
    @track adjustmentsLoading = false;

    // ── Page Ref ──────────────────────────────────────────
    @wire(CurrentPageReference)
    getStateParameters(pageRef) {
        if (pageRef) {
            this.recordId =
                pageRef.state?.recordId ||
                pageRef.attributes?.recordId ||
                null;
            console.log('Record Id:', this.recordId);
        }
    }

    // ── Dealer Summary Wire ───────────────────────────────
    @wire(getDealerSummary, { accountId: '$recordId' })
    wiredSummary({ data, error }) {
        if (data) {
            this.summary = data;
            this.error   = undefined;
        }
        if (error) {
            this.error = error;
            console.error('getDealerSummary error:', error);
        }
    }

    // ── Credit Limit Wire ─────────────────────────────────
    @wire(getDealerCreditData, { accountId: '$recordId' })
    wiredCreditData({ data, error }) {
        if (data) {
            console.log('Credit Data:', JSON.stringify(data));
            this.sanctionedLimit = data.creditLimit || 0;
            this.utilizedLimit   = data.utilized    || 0;
            this.availableLimit  = this.sanctionedLimit - this.utilizedLimit;

            if (this.availableLimit < 0) {
                this.creditStatus = 'Over Limit';
            } else if (this.availableLimit < this.sanctionedLimit * 0.2) {
                this.creditStatus = 'Critical';
            } else {
                this.creditStatus = 'Healthy';
            }
        } else if (error) {
            console.error('getDealerCreditData error:', error);
        }
    }

    // ── Computed ──────────────────────────────────────────
    get hasData() {
        return this.summary != null;
    }

    // ── Currency Formatter (Indian format) ───────────────
    formatCurrency(value) {
        if (!value && value !== 0) return '0';
        let numStr      = String(Math.round(value));
        let lastThree   = numStr.slice(-3);
        let otherDigits = numStr.slice(0, -3);

        if (otherDigits) {
            return otherDigits.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
        }
        return lastThree;
    }

    get sanctionedLimitDisplay() { return this.formatCurrency(this.sanctionedLimit); }
    get utilizedLimitDisplay()   { return this.formatCurrency(this.utilizedLimit);   }
    get availableLimitDisplay()  { return this.formatCurrency(this.availableLimit);  }

    // ── Open Modals ───────────────────────────────────────
    openOrders() {
        this.showOrdersModal = true;
        if (!this.orders) {
            this.ordersLoading = true;
            getDealerOrders({ accountId: this.recordId })
                .then(data => {
                    this.orders = data.map(o => ({
                        ...o,
                        expanded:    false,
                        expandIcon:  '▸',
                        statusClass: this.statusCss(o.status)
                    }));
                })
                .finally(() => { this.ordersLoading = false; });
        }
    }

    openPayments() {
        this.showPaymentsModal = true;
        if (!this.payments) {
            this.paymentsLoading = true;
            getDealerPayments({ accountId: this.recordId })
                .then(data => {
                    this.payments = data.map(p => ({
                        ...p,
                        statusClass: this.payStatusCss(p.status)
                    }));
                })
                .finally(() => { this.paymentsLoading = false; });
        }
    }

    openCredit() {
        this.showCreditModal = true;
        if (!this.creditNotes) {
            this.adjustmentsLoading = true;
            getDealerAdjustments({ accountId: this.recordId, type: 'Credit Note' })
                .then(data => { this.creditNotes = data; })
                .finally(() => { this.adjustmentsLoading = false; });
        }
    }

    openDebit() {
        this.showDebitModal = true;
        if (!this.debitNotes) {
            this.adjustmentsLoading = true;
            getDealerAdjustments({ accountId: this.recordId, type: 'Debit Note' })
                .then(data => { this.debitNotes = data; })
                .finally(() => { this.adjustmentsLoading = false; });
        }
    }

    // ── Close ─────────────────────────────────────────────
    closeModal() {
        this.showOrdersModal   = false;
        this.showPaymentsModal = false;
        this.showCreditModal   = false;
        this.showDebitModal    = false;
    }

    stopProp(event) {
        event.stopPropagation();
    }

    // ── Toggle Order Row ──────────────────────────────────
    toggleOrder(event) {
        const id   = event.currentTarget.dataset.id;
        this.orders = this.orders.map(o => {
            if (o.orderId === id) {
                const expanded = !o.expanded;
                return { ...o, expanded, expandIcon: expanded ? '▾' : '▸' };
            }
            return o;
        });
    }

    // ── CSS helpers ───────────────────────────────────────
    statusCss(status) {
        const map = {
            'Activated': 'status-chip active',
            'Draft':     'status-chip draft',
            'Cancelled': 'status-chip cancelled',
        };
        return map[status] || 'status-chip draft';
    }

    payStatusCss(status) {
        const map = {
            'Cleared': 'status-chip active',
            'Pending': 'status-chip draft',
            'Failed':  'status-chip cancelled',
        };
        return map[status] || 'status-chip draft';
    }
}