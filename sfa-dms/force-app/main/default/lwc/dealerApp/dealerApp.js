import { LightningElement,wire} from 'lwc';
import USER_ID from '@salesforce/user/Id';
import { getRecord } from 'lightning/uiRecordApi';
import NAME_FIELD from '@salesforce/schema/User.Name';

export default class DealerApp extends LightningElement {
    activeMenuItem = 'dashboard';

    userName;

    @wire(getRecord, { recordId: USER_ID, fields: [NAME_FIELD] })
    wiredUser({ data, error }) {
        if (data) {
            this.userName = data.fields.Name.value;
        }
    }

    handleLogout() {
    window.location.href = '/secur/logout.jsp';
}

    get pageTitle() {

        if (this.activeMenuItem === 'dashboard') return 'Dashboard';
        if (this.activeMenuItem === 'orders') return 'Orders';
        if (this.activeMenuItem === 'inventory') return 'Inventory';
        if (this.activeMenuItem === 'insights') return 'AI Insights';

    }
    selectedOrderId;

    handleOpenOrder(event) {
        this.selectedOrderId = event.detail.orderId;

        // switch to Orders tab
        this.activeMenuItem = 'orders';
    }

    get isDashboard() {
        return this.activeMenuItem === 'dashboard';
    }

    get isOrders() {
        return this.activeMenuItem === 'orders';
    }

    get isInventory() {
        return this.activeMenuItem === 'inventory';
    }

    get isInsights() {
        return this.activeMenuItem === 'insights';
    }

    get isDealers() {
        return this.activeMenuItem === 'dealers';
    }

    get dealersClass() {
        return this.activeMenuItem === 'dealers' ? 'menu-item active' : 'menu-item';
    }

    get dashboardClass() {
        return this.activeMenuItem === 'dashboard' ? 'menu-item active' : 'menu-item';
    }

    get ordersClass() {
        return this.activeMenuItem === 'orders' ? 'menu-item active' : 'menu-item';
    }

    get inventoryClass() {
        return this.activeMenuItem === 'inventory' ? 'menu-item active' : 'menu-item';
    }

    get insightsClass() {
        return this.activeMenuItem === 'insights' ? 'menu-item active' : 'menu-item';
    }

    openInventory() {
        this.activeMenuItem = 'inventory';
    }
    openDashboard() {
        this.activeMenuItem = 'dashboard';
    }

    openOrders() {
        this.activeMenuItem = 'orders';
    }

    openInsights() {
        this.activeMenuItem = 'insights';
    }

    openDealers() {
        this.activeMenuItem = 'dealers';
    }
}