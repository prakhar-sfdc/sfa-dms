import { LightningElement, wire } from 'lwc';
import USER_ID from '@salesforce/user/Id';
import { getRecord } from 'lightning/uiRecordApi';
import NAME_FIELD from '@salesforce/schema/User.Name';

export default class DealerThemeLayout extends LightningElement {

    userName;

    @wire(getRecord, { recordId: USER_ID, fields: [NAME_FIELD] })
    wiredUser({ data }) {
        if (data) {
            this.userName = data.fields.Name.value;
        }
    }

    get activePage() {
        const path = this.cleanPath;

        if (path.includes('account')) return 'account';
        if (path.includes('order')) return 'orders';
        if (path.includes('dealer-inventory')) return 'inventory';
        if (path.includes('insights')) return 'insights';

        return 'dashboard'; // default
    }

    // 🔥 CURRENT URL
    get currentPath() {
        return window.location.pathname;
    }

    get cleanPath() {
        return window.location.pathname.toLowerCase();
    }
    get dashboardClass() {
        return this.activePage === 'dashboard'
            ? 'menu-item active'
            : 'menu-item';
    }

    get dealersClass() {
        return this.activePage === 'account'
            ? 'menu-item active'
            : 'menu-item';
    }

    get ordersClass() {
        return this.activePage === 'orders'
            ? 'menu-item active'
            : 'menu-item';
    }

    get inventoryClass() {
        return this.activePage === 'inventory'
            ? 'menu-item active'
            : 'menu-item';
    }

    get insightsClass() {
        return this.activePage === 'insights'
            ? 'menu-item active'
            : 'menu-item';
    }

     get basePath() {
        const path = window.location.pathname;

        // Example:
        // /DMS/ → ["", "DMS", ""]
        // /DMS/account/... → ["", "DMS", "account", ...]

        return path.split('/')[1]; // returns "DMS"
    }
    goDashboard() {
        window.location.href = `/${this.basePath}/`;
    }

    goDealers() {
        window.location.href = `/${this.basePath}/account/Account/My_Dealers`;
    }

    goOrders() {
        window.location.href = `/${this.basePath}/order/Order/AllOrders`;
    }

    goInventory() {
        window.location.href = `/${this.basePath}/dealer-inventory/Dealer_Inventory__c/All`;
    }

    goInsights() {
        window.location.href = `/${this.basePath}/insights`;
    }

    handleLogout() {
        window.location.href = '/secur/logout.jsp';
    }
}