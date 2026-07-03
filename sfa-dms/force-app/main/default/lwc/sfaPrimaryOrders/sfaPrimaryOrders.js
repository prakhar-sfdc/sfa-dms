import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { encodeDefaultFieldValues } from 'lightning/pageReferenceUtils';
import getPrimaryOrders from '@salesforce/apex/PrimaryOrderController.getPrimaryOrders';
import getPrimaryRecordTypeId from '@salesforce/apex/PrimaryOrderController.getPrimaryRecordTypeId';

export default class SfaPrimaryOrders extends NavigationMixin(LightningElement) {

    @track allOrders       = [];
    @track filteredOrders  = [];
    @track isLoading       = false;

    @track searchTerm      = '';
    @track activeStatus    = 'All';

    @track detailRecordId  = null;
    primaryRecordTypeId    = null;

    statusOptions = ['All', 'Draft', 'Activated', 'Dispatched', 'Delivered'];

    connectedCallback() {
        this.loadOrders();
    }

    @wire(getPrimaryRecordTypeId)
    wiredRTId({ data }) {
        if (data) this.primaryRecordTypeId = data;
    }

    loadOrders() {
        this.isLoading = true;
        getPrimaryOrders()
            .then(result => {
                this.allOrders = (result || []).map(o => ({
                    ...o,
                    formattedAmount : this.formatCurrency(o.totalAmount),
                    statusClass     : this.getStatusClass(o.status)
                }));
                this.applyFilters();
            })
            .catch(error => {
                console.error('❌ SfaPrimaryOrders error:', error);
                this.allOrders = [];
                this.filteredOrders = [];
            })
            .finally(() => { this.isLoading = false; });
    }

    applyFilters() {
        let list = [...this.allOrders];
        if (this.activeStatus !== 'All') {
            list = list.filter(o => o.status === this.activeStatus);
        }
        if (this.searchTerm.trim()) {
            const q = this.searchTerm.toLowerCase();
            list = list.filter(o =>
                (o.orderNumber || '').toLowerCase().includes(q) ||
                (o.accountName || '').toLowerCase().includes(q)
            );
        }
        this.filteredOrders = list;
    }

    handleSearch(event) {
        this.searchTerm = event.target.value;
        this.applyFilters();
    }

    handleStatusFilter(event) {
        this.activeStatus = event.currentTarget.dataset.status;
        this.applyFilters();
        this.template.querySelectorAll('.status-pill').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.status === this.activeStatus);
        });
    }

    handleRefresh() {
        this.searchTerm  = '';
        this.activeStatus = 'All';
        this.loadOrders();
    }

    handleViewDetail(event) {
        this.detailRecordId = event.currentTarget.dataset.id;
    }

    handleBackFromDetail() {
        this.detailRecordId = null;
        this.loadOrders();
    }

    handleCreateOrder() {
        const defaultValues = this.primaryRecordTypeId
            ? encodeDefaultFieldValues({ RecordTypeId: this.primaryRecordTypeId })
            : undefined;

        this[NavigationMixin.Navigate]({
            type: 'standard__objectPage',
            attributes: {
                objectApiName: 'Order',
                actionName   : 'new'
            },
            state: {
                ...(defaultValues && { defaultFieldValues: defaultValues }),
                nooverride: '1'
            }
        });
    }

    get showList()   { return !this.detailRecordId; }
    get showDetail() { return !!this.detailRecordId; }

    get totalCount()     { return this.filteredOrders.length; }
    get activatedCount() { return this.allOrders.filter(o => o.status === 'Activated').length; }
    get draftCount()     { return this.allOrders.filter(o => o.status === 'Draft').length; }

    get totalValue() {
        const sum = this.filteredOrders.reduce((acc, o) => acc + (o.totalAmount || 0), 0);
        return this.formatCurrency(sum);
    }

    get isEmpty()   { return !this.isLoading && this.filteredOrders.length === 0; }
    get hasOrders() { return !this.isLoading && this.filteredOrders.length > 0; }

    get statusPills() {
        return this.statusOptions.map(s => ({
            label    : s,
            value    : s,
            pillClass: `status-pill${s === this.activeStatus ? ' active' : ''}`
        }));
    }

    formatCurrency(amount) {
        if (!amount && amount !== 0) return '—';
        return '₹' + Number(amount).toLocaleString('en-IN');
    }

    getStatusClass(status) {
        const map = {
            'Draft'     : 'order-status order-status--draft',
            'Activated' : 'order-status order-status--activated',
            'Completed' : 'order-status order-status--completed',
            'Cancelled' : 'order-status order-status--cancelled'
        };
        return map[status] || 'order-status order-status--draft';
    }
}
