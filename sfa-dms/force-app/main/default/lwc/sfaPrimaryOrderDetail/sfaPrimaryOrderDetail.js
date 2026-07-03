import { LightningElement, api, wire, track } from 'lwc';
import { getRecord, getFieldValue, notifyRecordUpdateAvailable } from 'lightning/uiRecordApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getPrimaryFieldsetFields from '@salesforce/apex/PrimaryOrderController.getPrimaryFieldsetFields';
import getOrderProducts       from '@salesforce/apex/PrimaryOrderController.getOrderProducts';
import getSubOrders           from '@salesforce/apex/PrimaryOrderController.getSubOrders';

import ORDER_NUMBER   from '@salesforce/schema/Order.OrderNumber';
import ORDER_STATUS   from '@salesforce/schema/Order.Status';
import ORDER_TOTAL    from '@salesforce/schema/Order.TotalAmount';
import ORDER_EFF_DATE from '@salesforce/schema/Order.EffectiveDate';
import ORDER_ACCOUNT  from '@salesforce/schema/Order.Account.Name';
import ORDER_DELIVERY from '@salesforce/schema/Order.Estimated_Delivery_Date__c';

const COMPACT_FIELDS = [
    ORDER_NUMBER, ORDER_STATUS, ORDER_TOTAL,
    ORDER_EFF_DATE, ORDER_ACCOUNT, ORDER_DELIVERY
];

export default class SfaPrimaryOrderDetail extends LightningElement {

    @api recordId;

    orderNumber   = '';
    status        = '';
    totalAmount   = '—';
    effectiveDate = '—';
    deliveryDate  = '—';
    accountName   = '—';

    @track activeTab = 'details';

    @track viewFields      = [];
    @track editFields      = [];
    @track isLoadingFields = true;

    @track orderProducts     = [];
    @track isLoadingProducts = false;
    @track productsLoaded    = false;

    @track subOrders          = [];
    @track isLoadingSubOrders = false;
    @track subOrdersLoaded    = false;

    @track showEditModal      = false;
    @track showInventoryModal = false;
    @track showSubOrderModal  = false;
    @track tatReady = false;

    @wire(getRecord, { recordId: '$recordId', fields: COMPACT_FIELDS })
    wiredOrder({ data, error }) {
        if (data) {
            this.orderNumber  = getFieldValue(data, ORDER_NUMBER)  || '—';
            this.status       = getFieldValue(data, ORDER_STATUS)  || '—';
            this.accountName  = getFieldValue(data, ORDER_ACCOUNT) || '—';

            const amt = getFieldValue(data, ORDER_TOTAL);
            this.totalAmount  = amt != null ? this.fmt(amt) : '—';

            const eff = getFieldValue(data, ORDER_EFF_DATE);
            this.effectiveDate = eff ? this.fmtDate(eff) : '—';

            const del = getFieldValue(data, ORDER_DELIVERY);
            this.deliveryDate  = del ? this.fmtDate(del) : '—';

            this.tatReady = true;
        }
        if (error) {
            console.error('Compact header wire error:', error);
        }
    }

    @wire(getPrimaryFieldsetFields)
    wiredFields({ data, error }) {
        if (data) {
            this.viewFields      = data.viewFields || [];
            this.editFields      = data.editFields || [];
            this.isLoadingFields = false;
        }
        if (error) {
            console.error('Fieldset wire error:', error);
            this.isLoadingFields = false;
        }
    }

    handleTabChange(event) {
        this.activeTab = event.currentTarget.dataset.tab;

        if (this.activeTab === 'products' && !this.productsLoaded) {
            this.fetchOrderProducts();
        }
        if (this.activeTab === 'suborders' && !this.subOrdersLoaded) {
            this.fetchSubOrders();
        }
    }

    fetchOrderProducts() {
        this.isLoadingProducts = true;
        getOrderProducts({ orderId: this.recordId })
            .then(result => {
                this.orderProducts = (result || []).map(p => ({
                    ...p,
                    formattedUnitPrice  : this.fmt(p.unitPrice),
                    formattedListPrice  : this.fmt(p.listPrice),
                    formattedTotalPrice : this.fmt(p.totalPrice)
                }));
                this.productsLoaded = true;
            })
            .catch(err => console.error('Products error:', err))
            .finally(() => { this.isLoadingProducts = false; });
    }

    fetchSubOrders() {
        this.isLoadingSubOrders = true;
        getSubOrders({ orderId: this.recordId })
            .then(result => {
                this.subOrders = (result || []).map(so => ({
                    ...so,
                    statusClass: this.subOrderStatusClass(so.status)
                }));
                this.subOrdersLoaded = true;
            })
            .catch(err => console.error('Sub orders error:', err))
            .finally(() => { this.isLoadingSubOrders = false; });
    }

    handleEdit() { this.showEditModal = true; }
    handleCloseEdit() { this.showEditModal = false; }

    handleEditSuccess() {
        this.showEditModal = false;
        notifyRecordUpdateAvailable([{ recordId: this.recordId }]);
        this.dispatchEvent(new ShowToastEvent({
            title  : 'Success',
            message: 'Order updated successfully.',
            variant: 'success'
        }));
        this._resetTabCaches();
    }

    handleEditError(event) {
        console.error('Edit error:', event.detail);
        this.dispatchEvent(new ShowToastEvent({
            title  : 'Error saving',
            message: event.detail?.detail || 'An error occurred.',
            variant: 'error'
        }));
    }

    handleOpenInventory() { this.showInventoryModal = true; }
    handleCloseInventory() { this.showInventoryModal = false; }

    handleInventorySaved() {
        this.showInventoryModal = false;
        this.productsLoaded = false;
        this.orderProducts  = [];
        if (this.activeTab === 'products') {
            this.fetchOrderProducts();
        }
        notifyRecordUpdateAvailable([{ recordId: this.recordId }]);
        this.dispatchEvent(new ShowToastEvent({
            title  : 'Products Added',
            message: 'Order products updated successfully.',
            variant: 'success'
        }));
    }

    handleOpenSubOrders() { this.showSubOrderModal = true; }
    handleCloseSubOrders() { this.showSubOrderModal = false; }

    handleSubOrdersCreated() {
        this.showSubOrderModal = false;
        this.subOrdersLoaded = false;
        this.subOrders       = [];
        if (this.activeTab === 'suborders') {
            this.fetchSubOrders();
        }
    }

    handleModalStop(event) { event.stopPropagation(); }

    handleBack() {
        this.dispatchEvent(new CustomEvent('back'));
    }

    _resetTabCaches() {
        this.productsLoaded  = false;
        this.subOrdersLoaded = false;
        this.orderProducts   = [];
        this.subOrders       = [];
        if (this.activeTab === 'products')  this.fetchOrderProducts();
        if (this.activeTab === 'suborders') this.fetchSubOrders();
    }

    get isDetailsTab()  { return this.activeTab === 'details';   }
    get isProductsTab() { return this.activeTab === 'products';  }
    get isSubOrdersTab(){ return this.activeTab === 'suborders'; }

    get tabItems() {
        return [
            {
                id      : 'details',
                label   : 'Details',
                badge   : null,
                tabClass: this.tabCls('details')
            },
            {
                id      : 'products',
                label   : 'Order Products',
                badge   : this.productsLoaded ? this.orderProducts.length : null,
                tabClass: this.tabCls('products')
            },
            {
                id      : 'suborders',
                label   : 'Sub Orders',
                badge   : this.subOrdersLoaded ? this.subOrders.length : null,
                tabClass: this.tabCls('suborders')
            }
        ];
    }

    tabCls(id) {
        return `pod-tab${this.activeTab === id ? ' pod-tab--active' : ''}`;
    }

    get statusBadgeClass() {
        const map = {
            'Draft'     : 'pod-status-badge pod-status-badge--draft',
            'Activated' : 'pod-status-badge pod-status-badge--activated',
            'Completed' : 'pod-status-badge pod-status-badge--completed',
            'Cancelled' : 'pod-status-badge pod-status-badge--cancelled'
        };
        return map[this.status] || 'pod-status-badge pod-status-badge--draft';
    }

    get isEditDisabled() { return this.status === 'Activated'; }

    get editBtnClass() {
        return this.isEditDisabled
            ? 'pod-edit-btn pod-edit-btn--disabled'
            : 'pod-edit-btn';
    }

    get editBtnTitle() {
        return this.isEditDisabled
            ? 'Order cannot be edited once Activated'
            : 'Edit this order';
    }

    get hasViewFields() { return this.viewFields.length > 0; }
    get hasProducts()   { return !this.isLoadingProducts && this.orderProducts.length > 0; }
    get noProducts()    { return !this.isLoadingProducts && this.orderProducts.length === 0; }

    get productsGrandTotal() {
        const sum = this.orderProducts.reduce((acc, p) => acc + (p.totalPrice || 0), 0);
        return this.fmt(sum);
    }

    get hasSubOrders() { return !this.isLoadingSubOrders && this.subOrders.length > 0; }
    get noSubOrders()  { return !this.isLoadingSubOrders && this.subOrders.length === 0; }

    fmt(amount) {
        if (amount == null) return '—';
        return '₹' + Number(amount).toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    fmtDate(dateStr) {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric'
        });
    }

    subOrderStatusClass(status) {
        const map = {
            'Open'       : 'pod-so-status pod-so-status--open',
            'In Progress': 'pod-so-status pod-so-status--progress',
            'Closed'     : 'pod-so-status pod-so-status--closed',
            'Cancelled'  : 'pod-so-status pod-so-status--cancelled'
        };
        return map[status] || 'pod-so-status pod-so-status--open';
    }
}
