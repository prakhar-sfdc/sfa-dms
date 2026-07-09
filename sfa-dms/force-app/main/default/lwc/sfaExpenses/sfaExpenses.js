import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getExpenseSummary   from '@salesforce/apex/ExpenseController.getExpenseSummary';
import getBudgetSummary    from '@salesforce/apex/ExpenseController.getBudgetSummary';
import getRecentExpenses   from '@salesforce/apex/ExpenseController.getRecentExpenses';
import getAllExpenses      from '@salesforce/apex/ExpenseController.getAllExpenses';
import getSpendByCategory  from '@salesforce/apex/ExpenseController.getSpendByCategory';
import getExpenseReceipts  from '@salesforce/apex/ExpenseController.getExpenseReceipts';
import getExpenseFormConfig from '@salesforce/apex/ExpenseController.getExpenseFormConfig';
import getTodayRouteDistance from '@salesforce/apex/ExpenseController.getTodayRouteDistance';
import createExpense       from '@salesforce/apex/ExpenseController.createExpense';
import uploadReceipt       from '@salesforce/apex/ExpenseController.uploadReceipt';
import submitExpense       from '@salesforce/apex/ExpenseController.submitExpense';

// Field-sales reimbursement categories. `mileage`/`da` drive conditional UI.
const CATEGORIES = [
    { value: 'Mileage',         label: 'Mileage',      icon: '🏍️', badge: 'travel'  },
    { value: 'Daily Allowance', label: 'Daily Allow.', icon: '📅', badge: 'food'    },
    { value: 'Toll',            label: 'Toll',         icon: '🛣️', badge: 'stay'    },
    { value: 'Parking',         label: 'Parking',      icon: '🅿️', badge: 'stay'    },
    { value: 'Conveyance',      label: 'Conveyance',   icon: '🚕', badge: 'misc'    },
    { value: 'Food',            label: 'Food',         icon: '🍽️', badge: 'food'    },
    { value: 'Lodging',         label: 'Lodging',      icon: '🏨', badge: 'stay'    },
    { value: 'Misc',            label: 'Misc',         icon: '🧾', badge: 'misc'    }
];

// Flat, disciplined per-category colour for the spend meter + dots.
const CATEGORY_COLORS = {
    'Mileage':         '#1565C0',
    'Travel':          '#1E88E5',
    'Daily Allowance': '#00838F',
    'Food':            '#2E7D32',
    'Toll':            '#E65100',
    'Parking':         '#F57C00',
    'Conveyance':      '#6A1B9A',
    'Lodging':         '#AD1457',
    'Stay':            '#EF6C00',
    'Misc':            '#4A5568'
};
const DEFAULT_COLOR = '#4A5568';

const EMPTY_FORM = () => ({
    source: 'Manual',
    category: '',
    vehicleType: '',
    distance: null,
    fromLocation: '',
    toLocation: '',
    days: 1,
    amount: null,
    expenseDate: new Date().toISOString().slice(0, 10),
    city: '',
    visitId: '',
    description: ''
});

export default class SfaExpenses extends LightningElement {

    @track expenseSummary = { totalAmount: 0, approvedCount: 0, pendingCount: 0, totalSubmissions: 0 };
    @track budget = { total: 0, used: 0, remaining: 0, usedPercent: 0, status: 'Within Budget' };
    @track recentExpenses = [];
    @track isExpenseLoading = false;
    @track showExpenseModal = false;
    @track selectedExpense = {};
    @track selectedReceipts = [];
    @track receiptsLoading = false;
    @track allExpenses = [];
    @track spendCategories = [];
    @track showExpenseSubmitModal = false;

    // Submit-form state
    @track form = EMPTY_FORM();
    @track config = { mileageRates: [], policies: [], remainingBudget: 0 };
    @track receiptFiles = [];
    @track isSaving = false;

    connectedCallback() {
        this.loadExpenseSummary();
        this.loadBudgetSummary();
        this.loadRecentExpenses();
        this.loadSpendBreakdown();
    }

    refreshDashboard() {
        this.loadRecentExpenses();
        this.loadExpenseSummary();
        this.loadBudgetSummary();
        this.loadSpendBreakdown();
    }

    // ---- Dashboard loaders -------------------------------------------------
    loadExpenseSummary() {
        getExpenseSummary()
            .then(result => {
                this.expenseSummary = {
                    totalAmount: result.totalAmount || 0,
                    approvedCount: result.approvedCount || 0,
                    pendingCount: result.pendingCount || 0,
                    totalSubmissions: result.totalSubmissions || 0
                };
            })
            .catch(error => console.error('Expense summary error', error));
    }

    loadBudgetSummary() {
        getBudgetSummary()
            .then(result => {
                this.budget = {
                    total: result.totalBudget,
                    used: result.usedAmount,
                    remaining: result.remainingAmount,
                    usedPercent: result.usedPercent,
                    status: result.status
                };
            })
            .catch(error => console.error('Budget summary error', error));
    }

    loadRecentExpenses() {
        this.isExpenseLoading = true;
        getRecentExpenses({ limitSize: 5 })
            .then(result => { this.recentExpenses = result.map(exp => this.mapExpense(exp)); })
            .catch(error => console.error('Recent expenses error', error))
            .finally(() => { this.isExpenseLoading = false; });
    }

    loadSpendBreakdown() {
        getSpendByCategory()
            .then(rows => {
                this.spendCategories = (rows || [])
                    .filter(r => (r.amount || 0) > 0)
                    .map(r => ({ type: r.type || 'Misc', amount: r.amount || 0, color: this.colorFor(r.type) }));
            })
            .catch(error => console.error('Spend breakdown error', error));
    }

    // ---- View models -------------------------------------------------------
    colorFor(type) { return CATEGORY_COLORS[type] || DEFAULT_COLOR; }

    fmtDate(value) {
        return value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    }
    fmtMoney(value) { return `₹${Number(value || 0).toLocaleString('en-IN')}`; }

    mapExpense(exp) {
        const isMileage = exp.Expense_Type__c === 'Mileage';
        return {
            id: exp.Id,
            date: exp.Expense_Date__c,
            formattedDate: this.fmtDate(exp.Expense_Date__c),
            type: exp.Expense_Type__c,
            description: exp.Description__c || '—',
            amount: exp.Amount__c || 0,
            amountDisplay: this.fmtMoney(exp.Amount__c),
            status: exp.Status__c,
            statusClass: this.getExpenseStatusClass(exp.Status__c),
            typeBadgeClass: this.getExpenseBadgeClass(exp.Expense_Type__c),
            typeDotStyle: `background:${this.colorFor(exp.Expense_Type__c)}`,
            source: exp.Expense_Source__c || '—',
            sourceBadgeClass: exp.Expense_Source__c === 'Auto' ? 'source-badge auto' : 'source-badge manual',
            city: exp.City__c || '—',
            isMileage,
            distance: exp.Distance__c,
            vehicleType: exp.Vehicle_Type__c || '—',
            ratePerKm: exp.Rate_Per_Km__c,
            mileageBreakdown: isMileage ? `${exp.Distance__c || 0} km × ${this.fmtMoney(exp.Rate_Per_Km__c)}/km` : '',
            fromLocation: exp.From_Location__c || '—',
            toLocation: exp.To_Location__c || '—',
            receiptCount: exp.Receipt_Count__c || 0,
            rejectionReason: exp.Rejection_Reason__c,
            isRejected: exp.Status__c === 'Rejected',
            submittedOn: exp.Submitted_On__c ? this.fmtDate(exp.Submitted_On__c) : '—',
            approvedOn: exp.Approved_On__c ? this.fmtDate(exp.Approved_On__c) : '—',
            submittedBy: exp.CreatedBy?.Name || 'You'
        };
    }

    get recentExpensesList() { return this.recentExpenses; }

    // ---- Budget spend meter (signature element) ---------------------------
    get meterDenominator() {
        const total = Number(this.budget.total) || 0;
        if (total > 0) return total;
        // no budget set: fall back to total spend so the breakdown still renders
        return this.spendCategories.reduce((s, c) => s + c.amount, 0) || 1;
    }
    get spendSegments() {
        const denom = this.meterDenominator;
        return this.spendCategories.map(c => ({
            key: c.type,
            style: `width:${Math.min((c.amount / denom) * 100, 100)}%;background:${c.color}`,
            title: `${c.type}: ${this.fmtMoney(c.amount)}`
        }));
    }
    get spendChips() {
        return this.spendCategories.map(c => ({
            key: c.type,
            label: c.type,
            amountDisplay: this.fmtMoney(c.amount),
            dotStyle: `background:${c.color}`
        }));
    }
    get hasSpend() { return this.spendCategories.length > 0; }
    get budgetUsedDisplay() { return this.fmtMoney(this.budget.used); }
    get budgetTotalDisplay() { return this.fmtMoney(this.budget.total); }
    get budgetRemainingDisplay() { return this.fmtMoney(this.budget.remaining); }
    get budgetPercentageText() { return `${this.budget.usedPercent || 0}% of budget used`; }
    get budgetStatusClass() {
        return this.budget.status === 'Over Budget' ? 'budget-status over-budget' : 'budget-status within-budget';
    }
    get emptySpendStyle() {
        const denom = this.meterDenominator;
        const used = this.spendCategories.reduce((s, c) => s + c.amount, 0);
        const remainingPct = Math.max(0, 100 - Math.min((used / denom) * 100, 100));
        return `width:${remainingPct}%`;
    }

    // ---- Summary tiles -----------------------------------------------------
    get totalAmountDisplay() { return this.fmtMoney(this.expenseSummary.totalAmount); }

    getExpenseStatusClass(status) {
        const map = { 'Approved': 'expense-status-approved', 'Submitted': 'expense-status-pending', 'Rejected': 'expense-status-rejected' };
        return map[status] || 'expense-status-draft';
    }
    getExpenseBadgeClass(type) {
        const found = CATEGORIES.find(c => c.value === type);
        const legacy = { 'Travel': 'travel', 'Food': 'food', 'Stay': 'stay', 'Misc': 'misc' };
        const badge = found ? found.badge : (legacy[type] || 'misc');
        return `expense-badge ${badge}`;
    }

    // ---- Submit form: open / config ---------------------------------------
    handleSubmitExpense() {
        this.form = EMPTY_FORM();
        this.receiptFiles = [];
        this.showExpenseSubmitModal = true;
        this.loadFormConfig();
    }

    closeExpenseSubmitModal() { this.showExpenseSubmitModal = false; }

    loadFormConfig() {
        getExpenseFormConfig()
            .then(cfg => {
                this.config = {
                    mileageRates: cfg.mileageRates || [],
                    policies: cfg.policies || [],
                    remainingBudget: cfg.remainingBudget || 0
                };
            })
            .catch(error => console.error('Form config error', error));
    }

    get categoryOptions() {
        return CATEGORIES.map(c => ({
            ...c,
            cssClass: this.form.category === c.value ? 'category-chip selected' : 'category-chip'
        }));
    }
    get vehicleOptions() {
        return this.config.mileageRates.map(r => ({ label: `${r.vehicleType} (₹${r.ratePerKm}/km)`, value: r.vehicleType }));
    }
    get sourceManualClass() { return this.form.source === 'Manual' ? 'mode-btn active' : 'mode-btn'; }
    get sourceAutoClass()   { return this.form.source === 'Auto'   ? 'mode-btn active' : 'mode-btn'; }
    get isMileage()        { return this.form.category === 'Mileage'; }
    get isDailyAllowance() { return this.form.category === 'Daily Allowance'; }
    get isAmountManual()   { return this.form.category && !this.isMileage && !this.isDailyAllowance; }
    get isAutoMode()       { return this.form.source === 'Auto'; }
    get currentPolicy()    { return this.config.policies.find(p => p.expenseType === this.form.category) || {}; }
    get requiresReceipt()  { return this.currentPolicy.requiresReceipt !== false; }
    get ratePerKm() {
        const r = this.config.mileageRates.find(v => v.vehicleType === this.form.vehicleType);
        return r ? r.ratePerKm : 0;
    }
    get computedAmount() {
        if (this.isMileage) return (Number(this.form.distance) || 0) * (Number(this.ratePerKm) || 0);
        if (this.isDailyAllowance) return (Number(this.form.days) || 0) * (Number(this.currentPolicy.defaultDA) || 0);
        return Number(this.form.amount) || 0;
    }
    get amountDisplay() { return this.fmtMoney(this.computedAmount); }
    get mileageBreakdown() { return `${this.form.distance || 0} km × ₹${this.ratePerKm}/km`; }
    get dailyAllowanceBreakdown() { return `${this.form.days || 0} day(s) × ₹${this.currentPolicy.defaultDA || 0}/day`; }
    get dailyCapWarning() {
        const cap = this.currentPolicy.dailyCap;
        return cap != null && this.computedAmount > cap ? `Exceeds daily cap of ₹${cap}` : '';
    }
    get remainingBudgetDisplay() { return this.fmtMoney(this.config.remainingBudget); }
    get overBudget() { return this.computedAmount > (this.config.remainingBudget || 0); }
    get receiptCountLabel() {
        const n = this.receiptFiles.length;
        return n === 0 ? 'No receipts attached' : `${n} receipt${n > 1 ? 's' : ''} attached`;
    }
    get receiptRequiredHint() { return this.requiresReceipt && this.receiptFiles.length === 0; }
    get submitDisabled() {
        if (this.isSaving) return true;
        if (this.requiresReceipt && this.receiptFiles.length === 0) return true;
        return false;
    }

    // ---- Form field handlers ----------------------------------------------
    setSourceManual() { this.form = { ...this.form, source: 'Manual' }; }
    setSourceAuto() {
        this.form = { ...this.form, source: 'Auto' };
        if (this.isMileage) this.prefillAutoDistance();
    }
    selectCategory(event) {
        const value = event.currentTarget.dataset.value;
        this.form = { ...this.form, category: value };
        if (value === 'Mileage' && this.isAutoMode) this.prefillAutoDistance();
    }
    prefillAutoDistance() {
        getTodayRouteDistance()
            .then(km => { this.form = { ...this.form, distance: km }; })
            .catch(error => console.error('Auto distance error', error));
    }
    handleVehicleChange(event) { this.form = { ...this.form, vehicleType: event.detail.value }; }
    handleFieldChange(event) {
        const field = event.target.dataset.field;
        this.form = { ...this.form, [field]: event.target.value };
    }

    // ---- Receipts (submit form) -------------------------------------------
    handleReceiptChange(event) {
        const files = Array.from(event.target.files || []);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result;
                this.receiptFiles = [
                    ...this.receiptFiles,
                    {
                        key: `${file.name}-${Date.now()}-${Math.random()}`,
                        name: file.name,
                        dataUrl,
                        isImage: file.type.startsWith('image/'),
                        base64: dataUrl.split(',')[1]
                    }
                ];
            };
            reader.readAsDataURL(file);
        });
        event.target.value = null;
    }
    removeReceipt(event) {
        const key = event.currentTarget.dataset.key;
        this.receiptFiles = this.receiptFiles.filter(f => f.key !== key);
    }
    triggerReceiptPicker() {
        const input = this.template.querySelector('.receipt-input');
        if (input) input.click();
    }

    // ---- Save / Submit -----------------------------------------------------
    validate(forSubmit) {
        if (!this.form.category) { this.toast('Missing category', 'Please choose an expense category.', 'warning'); return false; }
        if (this.isMileage) {
            if (!this.form.vehicleType) { this.toast('Missing vehicle', 'Select a vehicle type for mileage.', 'warning'); return false; }
            if (!(Number(this.form.distance) > 0)) { this.toast('Missing distance', 'Enter kilometers driven.', 'warning'); return false; }
        } else if (this.isDailyAllowance) {
            if (!(Number(this.form.days) > 0)) { this.toast('Missing days', 'Enter number of days.', 'warning'); return false; }
        } else if (!(Number(this.form.amount) > 0)) {
            this.toast('Missing amount', 'Enter the expense amount.', 'warning'); return false;
        }
        if (forSubmit && this.requiresReceipt && this.receiptFiles.length === 0) {
            this.toast('Receipt required', 'Attach at least one receipt to submit.', 'warning'); return false;
        }
        return true;
    }
    buildInput() {
        return {
            expenseType: this.form.category,
            source: this.form.source,
            amount: this.isDailyAllowance ? this.computedAmount : (this.isAmountManual ? Number(this.form.amount) : null),
            distance: this.isMileage ? Number(this.form.distance) : null,
            vehicleType: this.isMileage ? this.form.vehicleType : null,
            ratePerKm: this.isMileage ? this.ratePerKm : null,
            fromLocation: this.isMileage ? this.form.fromLocation : null,
            toLocation: this.isMileage ? this.form.toLocation : null,
            expenseDate: this.form.expenseDate,
            city: this.form.city,
            visitId: this.form.visitId,
            description: this.form.description
        };
    }
    handleSaveDraft() { this.doSave(false); }
    handleSubmitForm() { this.doSave(true); }

    async doSave(forSubmit) {
        if (!this.validate(forSubmit)) return;
        this.isSaving = true;
        try {
            const expId = await createExpense({ input: this.buildInput() });
            for (const f of this.receiptFiles) {
                // eslint-disable-next-line no-await-in-loop
                await uploadReceipt({ expenseId: expId, fileName: f.name, base64Data: f.base64 });
            }
            if (forSubmit) await submitExpense({ expenseId: expId });
            this.toast('Success', forSubmit ? 'Expense submitted for approval.' : 'Draft saved.', 'success');
            this.showExpenseSubmitModal = false;
            this.refreshDashboard();
        } catch (error) {
            const msg = error?.body?.message || error?.message || 'Failed to save expense.';
            this.toast('Error', msg, 'error');
        } finally {
            this.isSaving = false;
        }
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    // ---- Detail sheet ------------------------------------------------------
    handleViewExpenseDetails(event) {
        const expenseId = event.currentTarget.dataset.id;
        const expense = this.recentExpenses.find(exp => exp.id === expenseId)
            || this.allExpenses.find(exp => exp.id === expenseId);
        if (!expense) return;
        this.selectedExpense = expense;
        this.selectedReceipts = [];
        this.showExpenseModal = true;
        this.loadReceipts(expenseId);
    }

    loadReceipts(expenseId) {
        this.receiptsLoading = true;
        getExpenseReceipts({ expenseId })
            .then(list => {
                this.selectedReceipts = (list || []).map((r, i) => ({
                    key: r.versionId || `${i}`,
                    title: r.title,
                    isImage: r.isImage,
                    fileType: r.fileType,
                    url: r.downloadUrl
                }));
            })
            .catch(error => console.error('Receipts error', error))
            .finally(() => { this.receiptsLoading = false; });
    }

    get detailHasReceipts() { return this.selectedReceipts.length > 0; }

    closeExpenseModal() {
        this.showExpenseModal = false;
        this.selectedExpense = {};
        this.selectedReceipts = [];
    }

    viewAllExpenses() {
        getAllExpenses()
            .then(result => { this.allExpenses = result.map(exp => this.mapExpense(exp)); })
            .catch(error => console.error('All expenses error', error));
        this.dispatchEvent(new ShowToastEvent({ title: 'Expenses', message: 'Loading all expenses…', variant: 'info' }));
    }

    handleModalClick(event) { event.stopPropagation(); }
}
