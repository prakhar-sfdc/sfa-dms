import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getExpenseSummary  from '@salesforce/apex/ExpenseController.getExpenseSummary';
import getBudgetSummary   from '@salesforce/apex/ExpenseController.getBudgetSummary';
import getRecentExpenses  from '@salesforce/apex/ExpenseController.getRecentExpenses';
import getAllExpenses      from '@salesforce/apex/ExpenseController.getAllExpenses';

export default class SfaExpenses extends LightningElement {

    @track expenseSummary = { totalAmount: 0, approvedCount: 0, pendingCount: 0, totalSubmissions: 0 };
    @track budget = { total: 0, used: 0, remaining: 0, usedPercent: 0, status: 'Within Budget' };
    @track recentExpenses = [];
    @track isExpenseLoading = false;
    @track showExpenseModal = false;
    @track selectedExpense = {};
    @track showAllExpenses = false;
    @track allExpenses = [];
    @track showExpenseSubmitModal = false;

    @track expenseData = {
        expensesByType: [
            { type: 'Travel', amount: 0, color: '#1565C0' },
            { type: 'Food',   amount: 0, color: '#2E7D32' },
            { type: 'Stay',   amount: 0, color: '#E65100' },
            { type: 'Misc',   amount: 0, color: '#4A5568' }
        ]
    };

    connectedCallback() {
        this.loadExpenseSummary();
        this.loadBudgetSummary();
        this.loadRecentExpenses();
    }

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
            .then(result => {
                this.recentExpenses = result.map(exp => ({
                    id: exp.Id,
                    date: exp.Expense_Date__c,
                    formattedDate: exp.Expense_Date__c ? new Date(exp.Expense_Date__c).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
                    type: exp.Expense_Type__c,
                    description: exp.Description__c,
                    amount: exp.Amount__c,
                    status: exp.Status__c,
                    statusClass: this.getExpenseStatusClass(exp.Status__c)
                }));
                this.updateExpensesByType();
            })
            .catch(error => console.error('Recent expenses error', error))
            .finally(() => { this.isExpenseLoading = false; });
    }

    updateExpensesByType() {
        const typeMap = {};
        this.recentExpenses.forEach(exp => {
            const t = exp.type || 'Misc';
            typeMap[t] = (typeMap[t] || 0) + (exp.amount || 0);
        });
        this.expenseData = {
            expensesByType: [
                { type: 'Travel', amount: typeMap['Travel'] || 0, color: '#1565C0' },
                { type: 'Food',   amount: typeMap['Food']   || 0, color: '#2E7D32' },
                { type: 'Stay',   amount: typeMap['Stay']   || 0, color: '#E65100' },
                { type: 'Misc',   amount: typeMap['Misc']   || 0, color: '#4A5568' }
            ]
        };
    }

    get recentExpensesList() {
        return this.recentExpenses.map(exp => ({ ...exp, typeBadgeClass: this.getExpenseBadgeClass(exp.type), submittedBy: 'You' }));
    }

    get budgetProgressWidth() { return `width:${Math.min(this.budget.usedPercent, 100)}%`; }
    get budgetPercentageText() { return `${this.budget.usedPercent || 0}% Used`; }
    get budgetStatusClass() {
        return this.budget.status === 'Over Budget' ? 'budget-status over-budget' : 'budget-status within-budget';
    }

    get travelAmount() { return (this.expenseData.expensesByType.find(t => t.type === 'Travel') || {}).amount || 0; }
    get foodAmount()   { return (this.expenseData.expensesByType.find(t => t.type === 'Food')   || {}).amount || 0; }
    get stayAmount()   { return (this.expenseData.expensesByType.find(t => t.type === 'Stay')   || {}).amount || 0; }
    get miscAmount()   { return (this.expenseData.expensesByType.find(t => t.type === 'Misc')   || {}).amount || 0; }

    getExpenseStatusClass(status) {
        const map = { 'Approved': 'expense-status-approved', 'Submitted': 'expense-status-pending', 'Rejected': 'expense-status-rejected' };
        return map[status] || 'expense-status-draft';
    }

    getExpenseBadgeClass(type) {
        const map = { 'Travel': 'expense-badge travel', 'Food': 'expense-badge food', 'Stay': 'expense-badge stay', 'Misc': 'expense-badge misc' };
        return map[type] || 'expense-badge';
    }

    handleSubmitExpense() { this.showExpenseSubmitModal = true; }
    closeExpenseSubmitModal() { this.showExpenseSubmitModal = false; }

    handleExpenseSubmitSuccess() {
        this.showExpenseSubmitModal = false;
        this.dispatchEvent(new ShowToastEvent({ title: 'Success', message: 'Expense submitted successfully!', variant: 'success' }));
        this.loadRecentExpenses();
        this.loadExpenseSummary();
        this.loadBudgetSummary();
    }

    handleExpenseSubmitError(event) {
        console.error('Expense submit error:', event.detail);
        this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: event.detail?.detail || 'Failed to submit expense.', variant: 'error' }));
    }

    handleViewExpenseDetails(event) {
        const expenseId = event.currentTarget.dataset.id;
        const expense = this.recentExpenses.find(exp => exp.id === expenseId);
        if (expense) { this.selectedExpense = expense; this.showExpenseModal = true; }
    }

    closeExpenseModal() { this.showExpenseModal = false; this.selectedExpense = {}; }

    viewAllExpenses() {
        getAllExpenses()
            .then(result => {
                this.allExpenses = result.map(exp => ({
                    id: exp.Id,
                    formattedDate: exp.Expense_Date__c ? new Date(exp.Expense_Date__c).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
                    type: exp.Expense_Type__c, description: exp.Description__c,
                    amount: exp.Amount__c, status: exp.Status__c,
                    statusClass: this.getExpenseStatusClass(exp.Status__c),
                    typeBadgeClass: this.getExpenseBadgeClass(exp.Expense_Type__c),
                    submittedBy: exp.CreatedBy?.Name || '—'
                }));
            })
            .catch(error => console.error('All expenses error', error));
        this.dispatchEvent(new ShowToastEvent({ title: 'Expenses', message: 'Loading all expenses…', variant: 'info' }));
    }

    handleModalClick(event) { event.stopPropagation(); }
}
