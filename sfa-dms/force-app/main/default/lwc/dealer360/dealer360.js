import { LightningElement, wire, track } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import getDealerSummary from '@salesforce/apex/DealerSummaryController.getDealerSummary';
import getDealerOrders from '@salesforce/apex/DealerSummaryController.getDealerOrders';
import getDealerPayments from '@salesforce/apex/DealerSummaryController.getDealerPayments';
import getDealerAdjustments from '@salesforce/apex/DealerSummaryController.getDealerAdjustments';

const TOTAL_CARDS = 4;

export default class DealerSummary extends LightningElement {
    @track recordId;
    @track summary;
    @track error;

    // ── Carousel state ────────────────────────────────────
    @track currentIndex = 0;

    // Modal visibility
    @track showOrdersModal = false;
    @track showPaymentsModal = false;
    @track showCreditModal = false;
    @track showDebitModal = false;

    // Detail data
    @track orders;
    @track payments;
    @track creditNotes;
    @track debitNotes;

    // Loading states
    @track ordersLoading = false;
    @track paymentsLoading = false;
    @track adjustmentsLoading = false;

    // ── Page Ref ──────────────────────────────────────────
    @wire(CurrentPageReference)
    getStateParameters(pageRef) {
        if (pageRef) {
            this.recordId =
                pageRef.state?.recordId ||
                pageRef.attributes?.recordId ||
                null;
        }
    }

    // ── Summary ───────────────────────────────────────────
    @wire(getDealerSummary, { accountId: '$recordId' })
    wiredSummary({ data, error }) {
        if (data) {
            this.summary = data;
            this.error = undefined;
        }
        if (error) {
            this.error = error;
            console.error(error);
        }
    }

    get hasData() {
        return this.summary != null;
    }

    // ── Carousel Getters ──────────────────────────────────
    get isCard0() { return this.currentIndex === 0; }
    get isCard1() { return this.currentIndex === 1; }
    get isCard2() { return this.currentIndex === 2; }
    get isCard3() { return this.currentIndex === 3; }

    get isFirst() { return this.currentIndex === 0; }
    get isLast()  { return this.currentIndex === TOTAL_CARDS - 1; }

    get dot0() { return this.currentIndex === 0 ? 'dot dot--active' : 'dot'; }
    get dot1() { return this.currentIndex === 1 ? 'dot dot--active' : 'dot'; }
    get dot2() { return this.currentIndex === 2 ? 'dot dot--active' : 'dot'; }
    get dot3() { return this.currentIndex === 3 ? 'dot dot--active' : 'dot'; }

    // ── Carousel Navigation ───────────────────────────────
    prevCard() {
        if (this.currentIndex > 0) {
            this.currentIndex -= 1;
        }
    }

    nextCard() {
        if (this.currentIndex < TOTAL_CARDS - 1) {
            this.currentIndex += 1;
        }
    }

    // ── Open Modals ───────────────────────────────────────
    openOrders() {
        this.showOrdersModal = true;
        if (!this.orders) {
            this.ordersLoading = true;
            getDealerOrders({ accountId: this.recordId })
                .then(data => {
                    this.orders = data.map(o => ({
                        ...o,
                        expanded: false,
                        expandIcon: '▸',
                        statusClass: this.statusCss(o.status)
                    }));
                })
                .finally(() => {
                    this.ordersLoading = false;
                });
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
                .finally(() => {
                    this.paymentsLoading = false;
                });
        }
    }

    openCredit() {
        this.showCreditModal = true;
        if (!this.creditNotes) {
            this.adjustmentsLoading = true;
            getDealerAdjustments({ accountId: this.recordId, type: 'Credit Note' })
                .then(data => {
                    this.creditNotes = data;
                })
                .finally(() => {
                    this.adjustmentsLoading = false;
                });
        }
    }

    openDebit() {
        this.showDebitModal = true;
        if (!this.debitNotes) {
            this.adjustmentsLoading = true;
            getDealerAdjustments({ accountId: this.recordId, type: 'Debit Note' })
                .then(data => {
                    this.debitNotes = data;
                })
                .finally(() => {
                    this.adjustmentsLoading = false;
                });
        }
    }

    // ── Close ─────────────────────────────────────────────
    closeModal() {
        this.showOrdersModal = false;
        this.showPaymentsModal = false;
        this.showCreditModal = false;
        this.showDebitModal = false;
    }

    stopProp(event) {
        event.stopPropagation();
    }

    // ── Toggle Order Row ──────────────────────────────────
    toggleOrder(event) {
        const id = event.currentTarget.dataset.id;
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
            'Draft': 'status-chip draft',
            'Cancelled': 'status-chip cancelled',
        };
        return map[status] || 'status-chip draft';
    }

    payStatusCss(status) {
        const map = {
            'Cleared': 'status-chip active',
            'Pending': 'status-chip draft',
            'Failed': 'status-chip cancelled',
        };
        return map[status] || 'status-chip draft';
    }
}