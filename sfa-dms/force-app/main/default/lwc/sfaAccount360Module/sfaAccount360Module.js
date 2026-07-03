import { LightningElement, track, wire } from 'lwc';
import { getRelatedListRecords } from 'lightning/uiRelatedListApi';
import searchAccounts from '@salesforce/apex/Account360Controller.searchAccounts';
import getAccount360 from '@salesforce/apex/Account360Controller.getAccount360';
import getDefaultAccountId from '@salesforce/apex/Account360Controller.getDefaultAccountId';
import { NavigationMixin } from 'lightning/navigation';

export default class SfaAccount360Module extends NavigationMixin(LightningElement) {

    // ─── Search ───────────────────────────────────────────────────
    @track searchKey = '';
    @track searchResults = [];
    @track showSearchDropdown = false;
    searchTimeout;

    // ─── Data ─────────────────────────────────────────────────────
    @track selectedAccount;
    @track visits = [];
    @track contacts = [];
    @track orders = [];
    @track adjustments = [];
    @track payments = [];
    @track invoices = [];

    // ─── KPI ──────────────────────────────────────────────────────
    totalVisits = 0;
    completedVisits = 0;
    pendingVisits = 0;
    totalOrders = 0;
    lastVisitDate;

    // ─── UI ───────────────────────────────────────────────────────
    @track isLoading = false;
    @track isUploadModalOpen = false;
    @track activeTab = 'details';

    // ─── Lifecycle ────────────────────────────────────────────────
    connectedCallback() {
        this.loadDefaultAccount();
    }

    // ─── Wire: Contacts ───────────────────────────────────────────
    @wire(getRelatedListRecords, {
        parentRecordId: '$selectedAccount.Id',
        relatedListId: 'Contacts',
        fields: ['Contact.Id', 'Contact.Name', 'Contact.Phone', 'Contact.Email',
                 'Contact.MobilePhone', 'Contact.Title', 'Contact.Department']
    })
    wiredContacts({ data, error }) {
        if (data) {
            this.contacts = data.records.map(record => {
                const name = record.fields.Name.value || '';
                const parts = name.trim().split(' ');
                const initials = parts.length >= 2
                    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                    : name.slice(0, 2).toUpperCase();
                return {
                    Id: record.fields.Id.value,
                    Name: name,
                    Phone: record.fields.Phone?.value || '—',
                    Email: record.fields.Email?.value || '—',
                    MobilePhone: record.fields.MobilePhone?.value || '—',
                    Title: record.fields.Title?.value || '',
                    initials
                };
            });
        } else if (error) {
            console.error('Contacts wire error', error);
            this.contacts = [];
        }
    }

    // ─── Default Account ──────────────────────────────────────────
    loadDefaultAccount() {
        this.isLoading = true;
        getDefaultAccountId()
            .then((accId) => {
                if (accId) {
                    this.loadAccount360(accId);
                } else {
                    this.isLoading = false;
                    this.selectedAccount = null;
                }
            })
            .catch((err) => {
                console.error('Default account error', err);
                this.isLoading = false;
                this.selectedAccount = null;
            });
    }

    // ─── Search ───────────────────────────────────────────────────
    handleSearchChange(event) {
        this.searchKey = event.target.value;
        clearTimeout(this.searchTimeout);

        if (this.searchKey.length < 2) {
            this.searchResults = [];
            this.showSearchDropdown = false;
            return;
        }

        this.searchTimeout = setTimeout(() => {
            this.fetchAccounts();
        }, 400);
    }

    fetchAccounts() {
        searchAccounts({ keyword: this.searchKey })
            .then((res) => {
                this.searchResults = res || [];
                this.showSearchDropdown = true;
            })
            .catch((err) => {
                console.error(err);
                this.searchResults = [];
                this.showSearchDropdown = false;
            });
    }

    handleAccountSelect(event) {
        const accountId = event.currentTarget.dataset.id;
        this.searchKey = '';
        this.showSearchDropdown = false;
        this.loadAccount360(accountId);
    }

    // ─── Account 360 Load ─────────────────────────────────────────
    loadAccount360(accountId) {
        this.isLoading = true;

        getAccount360({ accountId })
            .then((res) => {
                if (!res) {
                    this.selectedAccount = null;
                    this.visits = [];
                    return;
                }
                console.log('Result : ',JSON.stringify(res));
                this.selectedAccount = res.account;

                this.visits = (res.visits || []).map(v => ({
                    ...v,
                    statusClass: this.getVisitStatusClass(v.Visit_Status__c)
                }));

                this.orders = (res.orders || []).map(o => ({
                    ...o,
                    statusClass: this.getOrderStatusClass(o.Status)
                }));

                this.adjustments = (res.adjustments || []).map(a => ({
                    ...a,
                    statusClass: this.getAdjustmentStatusClass(a.Status__c)
                }));

                this.payments = (res.payments || []).map(p => ({
                    ...p,
                    statusClass: this.getPaymentStatusClass(p.Status__c)
                }));

                this.invoices = (res.invoices || []).map(i => ({
                    ...i,
                    statusClass: this.getInvoiceStatusClass(i.Status__c)
                }));
                this.totalOrders=res.totalOrders ||0;
                this.totalVisits = res.totalVisits || 0;
                this.completedVisits = res.completedVisits || 0;
                this.pendingVisits = res.pendingVisits || 0;
                this.lastVisitDate = res.lastVisitDate;
            })
            .catch((err) => {
                console.error('Account360 error', err);
                this.selectedAccount = null;
                this.visits = [];
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    // ─── Tab Switching ────────────────────────────────────────────
    handleTabSwitch(event) {
        this.activeTab = event.currentTarget.dataset.tab;
    }

    get tabClass_details()     { return this.activeTab === 'details'     ? 'tabBtn active' : 'tabBtn'; }
    get tabClass_contacts()    { return this.activeTab === 'contacts'    ? 'tabBtn active' : 'tabBtn'; }
    get tabClass_visits()      { return this.activeTab === 'visits'      ? 'tabBtn active' : 'tabBtn'; }
    get tabClass_orders()      { return this.activeTab === 'orders'      ? 'tabBtn active' : 'tabBtn'; }
    get tabClass_adjustments() { return this.activeTab === 'adjustments' ? 'tabBtn active' : 'tabBtn'; }
    get tabClass_payments()    { return this.activeTab === 'payments'    ? 'tabBtn active' : 'tabBtn'; }
    get tabClass_invoices()    { return this.activeTab === 'invoices'    ? 'tabBtn active' : 'tabBtn'; }
    get tabClass_documents()   { return this.activeTab === 'documents'   ? 'tabBtn active' : 'tabBtn'; }

    get showTab_details()     { return this.activeTab === 'details'; }
    get showTab_contacts()    { return this.activeTab === 'contacts'; }
    get showTab_visits()      { return this.activeTab === 'visits'; }
    get showTab_orders()      { return this.activeTab === 'orders'; }
    get showTab_adjustments() { return this.activeTab === 'adjustments'; }
    get showTab_payments()    { return this.activeTab === 'payments'; }
    get showTab_invoices()    { return this.activeTab === 'invoices'; }
    get showTab_documents()   { return this.activeTab === 'documents'; }

    // ─── List guards ──────────────────────────────────────────────
    get hasContacts()    { return this.contacts.length > 0; }
    get hasVisits()      { return this.visits.length > 0; }
    get hasOrders()      { return this.orders.length > 0; }
    get hasAdjustments() { return this.adjustments.length > 0; }
    get hasPayments()    { return this.payments.length > 0; }
    get hasInvoices()    { return this.invoices.length > 0; }

    // ─── Upload / Navigate ────────────────────────────────────────
    handleHeaderUploadDocs() {
        if (!this.selectedAccount) return;
        this.isUploadModalOpen = true;
    }

    closeUploadModal() {
        this.isUploadModalOpen = false;
    }

    handleNewVisit() {
        if (!this.selectedAccount) return;
        this[NavigationMixin.Navigate]({
            type: 'standard__objectPage',
            attributes: { objectApiName: 'Visit__c', actionName: 'new' },
            state: { defaultFieldValues: `Account__c=${this.selectedAccount.Id}` }
        });
    }

    handleNewContact() {
        if (!this.selectedAccount) return;
        this[NavigationMixin.Navigate]({
            type: 'standard__objectPage',
            attributes: { objectApiName: 'Contact', actionName: 'new' },
            state: { defaultFieldValues: `AccountId=${this.selectedAccount.Id}` }
        });
    }

    // ─── Computed Getters ─────────────────────────────────────────
    get accountInitials() {
        if (!this.selectedAccount?.Name) return '?';
        const parts = this.selectedAccount.Name.trim().split(' ');
        return parts.length >= 2
            ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
            : this.selectedAccount.Name.slice(0, 2).toUpperCase();
    }

    get statusBadgeClass() {
        const status = this.selectedAccount?.Account_Status__c || '';
        if (status === 'Active')   return 'statusBadge active';
        if (status === 'Inactive') return 'statusBadge inactive';
        return 'statusBadge neutral';
    }

    get billingAddress() {
        if (!this.selectedAccount) return '—';
        const a = this.selectedAccount;
        const parts = [a.BillingStreet, a.BillingCity, a.BillingState,
                       a.BillingPostalCode, a.BillingCountry].filter(Boolean);
        return parts.length ? parts.join(', ') : '—';
    }

    get ownerName() {
        return this.selectedAccount?.Owner?.Name || '—';
    }

    get noResults() {
        return this.searchResults.length === 0 && this.searchKey.length >= 2;
    }

    // ─── Status class helpers ─────────────────────────────────────
    getVisitStatusClass(status) {
        if (status === 'Completed') return 'pill green';
        if (status === 'Scheduled') return 'pill blue';
        if (status === 'Cancelled') return 'pill red';
        return 'pill gray';
    }

    getOrderStatusClass(status) {
        if (status === 'Activated') return 'pill green';
        if (status === 'Draft')     return 'pill gray';
        if (status === 'Cancelled') return 'pill red';
        return 'pill blue';
    }

    getAdjustmentStatusClass(status) {
        if (status === 'Approved')  return 'pill green';
        if (status === 'Pending')   return 'pill warn';
        if (status === 'Rejected')  return 'pill red';
        return 'pill gray';
    }

    getPaymentStatusClass(status) {
        if (status === 'Cleared')   return 'pill green';
        if (status === 'Pending')   return 'pill warn';
        if (status === 'Failed')    return 'pill red';
        return 'pill gray';
    }

    getInvoiceStatusClass(status) {
        if (status === 'Paid')        return 'pill green';
        if (status === 'Unpaid')      return 'pill red';
        if (status === 'Overdue')     return 'pill red';
        if (status === 'Partial')     return 'pill warn';
        return 'pill gray';
    }
}
