import { LightningElement, wire, track } from 'lwc';
import chartjs from '@salesforce/resourceUrl/chartjs';
import { loadScript } from 'lightning/platformResourceLoader';
import getRecentOrders from '@salesforce/apex/DealerDashboardController.getRecentOrders';
import getDashboardKPIs from '@salesforce/apex/DealerDashboardController.getDashboardKPIs';
import getTopDealers from '@salesforce/apex/DealerDashboardController.getTopDealers';
import getRevenueByMonth from '@salesforce/apex/DealerDashboardController.getRevenueByMonth';
import getDealersByRegion from '@salesforce/apex/DealerDashboardController.getDealersByRegion';
import getTopProducts from '@salesforce/apex/DealerDashboardController.getTopProducts';
import getLowInventory from '@salesforce/apex/DealerDashboardController.getLowInventory';
import getOrdersByStatus from '@salesforce/apex/DealerDashboardController.getOrdersByStatus';
import getUpcomingDeliveries from '@salesforce/apex/DealerDashboardController.getUpcomingDeliveries';
import getCreditLimitData from '@salesforce/apex/DealerDashboardController.getCreditLimitData';

export default class DealerDashboard extends LightningElement {

    // ─── Flags ────────────────────────────────────────────────────────────────
    chartInitialized  = false;
    scriptLoadStarted = false;

    // ─── Data ─────────────────────────────────────────────────────────────────
    recentOrders       = [];
    @track kpis        = {};
    @track topDealers  = [];
    @track lowStockProducts   = [];
    @track upcomingDeliveries = [];
    @track statusLegend       = [];
    kpiCards = [];
    @track creditData = {
    creditLimit: 0,
    utilized:    0,
    available:   0,
    creditStatus:'Healthy'
};

    // ─── Chart instances ──────────────────────────────────────────────────────
    salesChart    = null;
    ordersChart   = null;
    productsChart = null;
    statusChart   = null;

    // ─── Raw chart data ───────────────────────────────────────────────────────
    salesChartData = {
        labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'],
        values: [0,0,0,0,0,0,0,0],
        label: 'Revenue (₹)'
    };
    ordersChartData = {
        labels: ['North','South','West','East'],
        values: [0,0,0,0],
        colors: ['#3b82f6','#10b981','#f59e0b','#6366f1']
    };
    productsChartData = {
        labels: [], values: [], label: 'Units Sold'
    };
    statusChartData = {
        labels: [], values: [], colors: []
    };

    // Status → color map
    statusColorMap = {
    'Draft':        '#94a3b8',
    'Activated':    '#3b82f6',
    'Pending':      '#f59e0b',
    'Processing':   '#6366f1',
    'Dispatched':   '#0ea5e9',   // ← ADD THIS
    'Shipped':      '#0ea5e9',
    'Delivered':    '#10b981',
    'Cancelled':    '#ef4444',
    'Completed':    '#22c55e'
};

    todayDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });

    // =========================================================================
    // LIFECYCLE
    // =========================================================================
    renderedCallback() {
        if (this.scriptLoadStarted) return;
        this.scriptLoadStarted = true;

        loadScript(this, chartjs)
            .then(() => {
                if (typeof window.Chart !== 'function') {
                    console.error('ChartJS loaded but window.Chart is not a constructor');
                    return;
                }
                this.chartInitialized = true;
                this.initializeCharts();
            })
            .catch(error => console.error('ChartJS failed to load', error));
    }

    @wire(getCreditLimitData)
wiredCreditData({ data, error }) {
    if (data) {
        this.creditData = {
            creditLimit:  data.creditLimit  || 0,
            utilized:     data.utilized     || 0,
            available:    data.available    || 0,
            creditStatus: data.creditStatus || 'Healthy'
        };
    } else if (error) {
        console.error('Credit Limit Error', error);
    }
}

// ── Credit Limit getters ────────────────────────────────────────────
get sanctionedLimitDisplay() { return this.formatCurrencyShort(this.creditData.creditLimit); }
get utilizedLimitDisplay()   { return this.formatCurrencyShort(this.creditData.utilized); }
get availableLimitDisplay()  { return this.formatCurrencyShort(this.creditData.available); }
get creditStatus()           { return this.creditData.creditStatus; }

get utilizationPct() {
    if (!this.creditData.creditLimit) return 0;
    return Math.min(100, Math.round((this.creditData.utilized / this.creditData.creditLimit) * 100));
}

get utilizationBarStyle() {
    const pct  = this.utilizationPct;
    const color = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981';
    return `width:${pct}%; background:${color};`;
}

get creditStatusClass() {
    const s = this.creditData.creditStatus;
    if (s === 'Over Limit') return 'cr-status cr-status--over';
    if (s === 'Critical')   return 'cr-status cr-status--critical';
    return 'cr-status cr-status--healthy';
}

    // =========================================================================
    // WIRE HANDLERS
    // =========================================================================
    @wire(getLowInventory)
    wiredLowInventory({ data, error }) {
        if (data) {
            this.lowStockProducts = data.map(p => ({
                ...p,
                stockClass: p.isCritical ? 'very-low' : 'low'
            }));
        } else if (error) {
            console.error('Low Inventory Error', error);
        }
    }

    @wire(getRevenueByMonth)
    wiredRevenue({ data, error }) {
        if (data) {
            const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            this.salesChartData = {
                labels: data.map(d => monthNames[d.month - 1]),
                values: data.map(d => d.total || 0),
                label: 'Revenue (₹)'
            };
            this.refreshChart('sales');
        } else if (error) {
            console.error('Revenue By Month Error', error);
        }
    }

    @wire(getDealersByRegion)
    wiredRegions({ data, error }) {
        if (data) {
            this.ordersChartData = {
                labels: data.map(d => d.region || 'Unknown'),
                values: data.map(d => d.count),
                colors: ['#3b82f6','#10b981','#f59e0b','#6366f1']
            };
            this.refreshChart('region');
        } else if (error) {
            console.error('Dealers By Region Error', error);
        }
    }

    @wire(getTopProducts)
    wiredProducts({ data, error }) {
        if (data) {
            this.productsChartData = {
                labels: data.map(d => d.name),
                values: data.map(d => d.qty || 0),
                label: 'Units Sold'
            };
            this.refreshChart('products');
        } else if (error) {
            console.error('Top Products Error', error);
        }
    }

    @wire(getDashboardKPIs)
    wiredKPIs({ data, error }) {
        if (data) {
            this.kpis = data;
            this.buildKpiCards();
        } else if (error) {
            console.error('Dashboard KPIs Error', error);
        }
    }

    @wire(getRecentOrders)
    wiredOrders({ data, error }) {
        if (data) {
            this.recentOrders = data.map(order => ({
                id: order.recordId,
                orderNumber: order.orderNumber,
                status: order.status,
                statusClassFull: this.getStatusClass(order.status)
            }));
        } else if (error) {
            console.error('Recent Orders Error', error);
        }
    }

    @wire(getTopDealers)
    wiredTopDealers({ data, error }) {
        if (data) {
            this.topDealers = data.map(d => ({
                id: d.id,
                name: d.name,
                revenue: this.formatCurrencyShort(d.revenue)
            }));
        } else if (error) {
            console.error('Top Dealers Error', error);
        }
    }

    // ✅ NEW: Orders by Status wire
    @wire(getOrdersByStatus)
    wiredOrdersByStatus({ data, error }) {
        if (data) {
            const colors = data.map(d =>
                this.statusColorMap[d.status] || '#94a3b8'
            );

            this.statusChartData = {
                labels: data.map(d => d.status),
                values: data.map(d => d.count),
                colors: colors
            };

            // Build legend
            this.statusLegend = data.map((d, i) => ({
                label: d.status,
                count: d.count,
                dotStyle: `background:${colors[i]};width:10px;height:10px;border-radius:50%;display:inline-block;flex-shrink:0;`
            }));

            this.refreshChart('status');
        } else if (error) {
            console.error('Orders By Status Error', error);
        }
    }

    // ✅ NEW: Upcoming Deliveries wire
    @wire(getUpcomingDeliveries)
    wiredUpcomingDeliveries({ data, error }) {
        if (data) {
            this.upcomingDeliveries = data.map(d => ({
                id:           d.id,
                orderNumber:  d.orderNumber,
                dealerName:   d.dealerName,
                deliveryDate: d.deliveryDate,
                daysLeft:     d.daysLeft,
                daysLabel:    d.daysLeft === 0
                                ? 'Today'
                                : d.daysLeft === 1
                                    ? 'Tomorrow'
                                    : `${d.daysLeft}d away`,
                urgencyClass: this.getUrgencyClass(d.urgency)
            }));
        } else if (error) {
            console.error('Upcoming Deliveries Error', error);
        }
    }

    get noDeliveries() {
        return this.upcomingDeliveries.length === 0;
    }

    // =========================================================================
    // CHART HELPERS
    // =========================================================================
    refreshChart(type) {
        if (!this.chartInitialized) return;
        if (type === 'sales')    this.loadSalesChart();
        if (type === 'region')   this.loadOrdersChart();
        if (type === 'products') this.loadProductsChart();
        if (type === 'status')   this.loadStatusChart();
    }

    initializeCharts() {
        this.loadSalesChart();
        this.loadOrdersChart();
        this.loadProductsChart();
        this.loadStatusChart();
    }

    loadSalesChart() {
        if (this.salesChart) { this.salesChart.destroy(); this.salesChart = null; }
        const canvas = this.template.querySelector('.salesChart');
        if (!canvas) return;
        this.salesChart = new window.Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: this.salesChartData.labels,
                datasets: [{
                    label: this.salesChartData.label,
                    data: this.salesChartData.values,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59,130,246,0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    loadOrdersChart() {
        if (this.ordersChart) { this.ordersChart.destroy(); this.ordersChart = null; }
        const canvas = this.template.querySelector('.ordersChart');
        if (!canvas) return;
        this.ordersChart = new window.Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: this.ordersChartData.labels,
                datasets: [{
                    data: this.ordersChartData.values,
                    backgroundColor: this.ordersChartData.colors,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { boxWidth: 12, padding: 16, font: { size: 13, weight: '600' } }
                    }
                }
            }
        });
    }

    loadProductsChart() {
        if (this.productsChart) { this.productsChart.destroy(); this.productsChart = null; }
        const canvas = this.template.querySelector('.productsChart');
        if (!canvas) return;
        this.productsChart = new window.Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: this.productsChartData.labels,
                datasets: [{
                    label: this.productsChartData.label,
                    data: this.productsChartData.values,
                    backgroundColor: '#3b82f6'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    }

    // ✅ NEW: Status Pie Chart
    loadStatusChart() {
        if (this.statusChart) { this.statusChart.destroy(); this.statusChart = null; }
        const canvas = this.template.querySelector('.statusChart');
        if (!canvas) return;
        if (!this.statusChartData.labels.length) return;

        this.statusChart = new window.Chart(canvas.getContext('2d'), {
            type: 'pie',
            data: {
                labels: this.statusChartData.labels,
                datasets: [{
                    data: this.statusChartData.values,
                    backgroundColor: this.statusChartData.colors,
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },  // custom legend rendered in HTML
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${ctx.label}: ${ctx.raw} orders`
                        }
                    }
                }
            }
        });
    }

    // =========================================================================
    // UI HELPERS
    // =========================================================================
    handleOrderClick(event) {
        const orderId = event.currentTarget.dataset.id;
        this.dispatchEvent(new CustomEvent('openorder', { detail: { orderId } }));
    }

    getStatusClass(status) {
        if (!status) return 'order-status';
        const s = status.toLowerCase();
        if (s.includes('delivered') || s.includes('completed')) return 'order-status status-delivered';
        if (s.includes('processing') || s.includes('shipped'))  return 'order-status status-processing';
        if (s.includes('pending') || s.includes('draft'))       return 'order-status status-pending';
        return 'order-status';
    }

    getUrgencyClass(urgency) {
        if (urgency === 'urgent') return 'delivery-badge badge-urgent';
        if (urgency === 'soon')   return 'delivery-badge badge-soon';
        return 'delivery-badge badge-normal';
    }

    buildKpiCards() {
        this.kpiCards = [
            { id: 1, label: 'Total Dealers',   value: this.kpis.totalDealers || 0,  trend: '+ live',          trendClassFull: 'trend positive' },
            { id: 2, label: 'Active Dealers',  value: this.kpis.activeDealers || 0, trend: 'Active network',  trendClassFull: 'trend neutral'  },
            { id: 3, label: 'Total Revenue',   value: this.formatCurrencyShort(this.kpis.revenue), trend: 'Overall revenue', trendClassFull: 'trend positive' },
            { id: 4, label: 'Total Orders',    value: this.kpis.totalOrders || 0,   trend: 'All time orders', trendClassFull: 'trend positive' },
            { id: 5, label: 'Pending Orders',  value: this.kpis.pendingOrders || 0, trend: 'Needs action',   trendClassFull: 'trend negative' }
        ];
    }

    formatCurrencyShort(value) {
        if (!value) return '₹0';
        if (value >= 10000000) return '₹' + (value / 10000000).toFixed(2) + ' Cr';
        if (value >= 100000)   return '₹' + (value / 100000).toFixed(2) + ' L';
        if (value >= 1000)     return '₹' + (value / 1000).toFixed(1) + ' K';
        return '₹' + value;
    }
}