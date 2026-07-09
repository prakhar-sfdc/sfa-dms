import { LightningElement, track, wire } from 'lwc';
import USER_ID from '@salesforce/user/Id';
import { getRecord } from 'lightning/uiRecordApi';
import NAME_FIELD from '@salesforce/schema/User.Name';
import PROFILE_NAME_FIELD from '@salesforce/schema/User.Profile.Name';

export default class DelhiverySFA extends LightningElement {
    @track activeTab = sessionStorage.getItem('activeTab') || 'dashboard';
    userName = '';
    userRole = '';
    timerInterval;

    @wire(getRecord, { recordIds: [USER_ID], fields: [NAME_FIELD, PROFILE_NAME_FIELD] })
    wiredUserRecord({ error, data }) {
        if (data) {
            this.userName = data.records[0].fields.Name.value;
            this.userRole = data.records[0].fields.Profile.displayValue || 'Field Sales Rep';
        } else if (error) {
            console.error('Error loading user record:', error);
        }
    }

    get tabs() {
        return [
            { id: 'dashboard', icon: '📊', label: 'Dashboard', shortLabel: 'Dash' },
            { id: 'attendance', icon: '✅', label: 'Attendance', shortLabel: 'Attend' },
            { id: 'journeyplan', icon: '📅', label: 'Journey Plan', shortLabel: 'Journey' },
            { id: 'visitexecution', icon: '📍', label: 'Visit Execution', shortLabel: 'Visits' },
            { id: 'expenses', icon: '💰', label: 'Expenses', shortLabel: 'Expense' },
            { id: 'newaccount', icon: '🏢', label: 'New Account', shortLabel: 'Account' },
            { id: 'aianalytics', icon: '🤖', label: 'AI Analytics', shortLabel: 'AI' },
            { id: 'account360', icon: '👁️', label: 'Account 360', shortLabel: '360' },
            { id: 'primaryorders', icon: '📦', label: 'Orders', shortLabel: 'Orders' }
        ].map(tab => ({
            ...tab,
            mobileNavClass: this.activeTab === tab.id ? 'mnav-btn active' : 'mnav-btn'
        }));
    }

    get isDashboardActive()       { return this.activeTab === 'dashboard'; }
    get isAttendanceActive()      { return this.activeTab === 'attendance'; }
    get isJourneyPlanActive()     { return this.activeTab === 'journeyplan'; }
    get isVisitExecutionActive()  { return this.activeTab === 'visitexecution'; }
    get isExpensesActive()        { return this.activeTab === 'expenses'; }
    get isNewAccountActive()      { return this.activeTab === 'newaccount'; }
    get isAiAnalyticsActive()     { return this.activeTab === 'aianalytics'; }
    get isAccount360Active()      { return this.activeTab === 'account360'; }
    get isPrimaryOrdersActive()   { return this.activeTab === 'primaryorders'; }

    connectedCallback() {
        this.activeTab = sessionStorage.getItem('activeTab') || 'dashboard';
    }

    disconnectedCallback() {
        if (this.timerInterval) clearInterval(this.timerInterval);
    }

    handleTabClick(event) {
        this.activeTab = event.currentTarget.dataset.id;
        sessionStorage.setItem('activeTab', this.activeTab);
        this.updateActiveTabStyles();
    }

    updateActiveTabStyles() {
        const tabs = this.template.querySelectorAll('.nav-tab');
        tabs.forEach(tab => { tab.classList.remove('active'); });
        const activeTab = this.template.querySelector(`.nav-tab[data-id="${this.activeTab}"]`);
        if (activeTab) activeTab.classList.add('active');
    }

    handleChildNavigate(event) {
        this.activeTab = event.detail.tab;
        sessionStorage.setItem('activeTab', this.activeTab);
        this.updateActiveTabStyles();
    }

    handleAccountSelect(event) {
        const selectedAccountId = event.detail?.accountId;
        if (selectedAccountId) {
            console.log('Account selected:', selectedAccountId);
        }
    }
}
