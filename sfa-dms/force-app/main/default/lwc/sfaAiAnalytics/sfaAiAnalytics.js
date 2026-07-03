import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getFieldForceAIInsights from '@salesforce/apex/FieldForceAIController.getFieldForceAIInsights';

export default class SfaAiAnalytics extends LightningElement {

    @track isAILoading = false;
    @track aiLoadError = '';
    @track lastRefreshTime = null;

    @track aiData = {
        kpis: [
            { id: 1, title: 'Monthly Sales', value: '₹12.4L', target: '₹15L', achievement: '82%', trend: '+12%', trendType: 'positive', progress: 82, insight: 'Focus on high-value deals to close gap' },
            { id: 2, title: 'Visit Compliance', value: '88%', target: '95%', achievement: '88%', trend: '+5%', trendType: 'positive', progress: 88, insight: 'Schedule 2 extra visits daily to reach target' },
            { id: 3, title: 'Active Dealers', value: '42', target: '50', achievement: '84%', trend: '+8%', trendType: 'positive', progress: 84, insight: 'Engage with 3 inactive dealers this week' },
            { id: 4, title: 'Avg Order Value', value: '₹2.1L', target: '₹2.5L', achievement: '84%', trend: '-3%', trendType: 'negative', progress: 84, insight: 'Promote premium products to boost AOV' }
        ],
        insights: [
            { id: 1, title: 'High Potential Dealer Identified', priority: 'high', priorityLabel: 'High Priority', cardClass: 'insight-card high-priority', priorityBadgeClass: 'priority-badge high', metric1Label: 'Dealer', metric1Value: 'Sharma Paper Mart', hasMetric2: true, metric2Label: 'Their Stock', metric2Value: '120 reams', recommendation: 'Offer a bulk discount to increase shelf share', impact: 'Potential additional revenue: ₹2.5L', icon: '🎯', impactIcon: '✅', impactClass: 'impact-section', isWarning: false },
            { id: 2, title: 'Visit Frequency Below Target', priority: 'high', priorityLabel: 'High Priority', cardClass: 'insight-card high-priority', priorityBadgeClass: 'priority-badge high', metric1Label: 'Planned', metric1Value: '8 visits', hasMetric2: true, metric2Label: 'Completed', metric2Value: '6 visits', recommendation: '2 high-priority visits are still pending', impact: 'Risk of missing monthly target', icon: '🔔', impactIcon: '⚠️', impactClass: 'impact-section warning', isWarning: true },
            { id: 3, title: 'Product Trend Analysis', priority: 'medium', priorityLabel: 'Medium Priority', cardClass: 'insight-card medium-priority', priorityBadgeClass: 'priority-badge medium', metric1Label: 'Product', metric1Value: 'JK Copier 75 GSM', hasMetric2: true, metric2Label: 'Demand', metric2Value: '+18% this month', recommendation: 'Promote this product aggressively in upcoming visits', impact: 'High upselling potential available', icon: '📈', impactIcon: '💎', impactClass: 'impact-section', isWarning: false },
            { id: 4, title: 'Expense ROI Excellent', priority: 'low', priorityLabel: 'Low Priority', cardClass: 'insight-card low-priority', priorityBadgeClass: 'priority-badge low', metric1Label: 'Expense Ratio', metric1Value: '4.2%', hasMetric2: false, metric2Label: '', metric2Value: '', recommendation: 'Excellent expense optimization', impact: 'Eligible for performance recognition', icon: '🏆', impactIcon: '⭐', impactClass: 'impact-section', isWarning: false }
        ],
        weeklyPerformance: [
            { day: 'Mon', visits: 8, orders: 6, revenue: '₹450K', conversion: '75%', trend: 'positive', summary: '8 visits · 6 orders · ₹450K', conversionClass: 'table-cell positive' },
            { day: 'Tue', visits: 7, orders: 5, revenue: '₹385K', conversion: '71%', trend: 'positive', summary: '7 visits · 5 orders · ₹385K', conversionClass: 'table-cell positive' },
            { day: 'Wed', visits: 9, orders: 7, revenue: '₹520K', conversion: '78%', trend: 'positive', summary: '9 visits · 7 orders · ₹520K', conversionClass: 'table-cell positive' },
            { day: 'Thu', visits: 6, orders: 4, revenue: '₹320K', conversion: '67%', trend: 'neutral', summary: '6 visits · 4 orders · ₹320K', conversionClass: 'table-cell neutral' },
            { day: 'Fri', visits: 8, orders: 6, revenue: '₹480K', conversion: '75%', trend: 'positive', summary: '8 visits · 6 orders · ₹480K', conversionClass: 'table-cell positive' }
        ],
        topProducts: [
            { rank: 1, name: 'JK Copier 75 GSM', growth: '18%', quantity: '8,500 reams', revenue: '₹42.5L' },
            { rank: 2, name: 'JK Bond 80 GSM', growth: '12%', quantity: '5,600 reams', revenue: '₹31.0L' },
            { rank: 3, name: 'JK Excel 70 GSM', growth: '8%', quantity: '6,200 reams', revenue: '₹28.0L' },
            { rank: 4, name: 'JK Easy Copier', growth: '22%', quantity: '2,000 reams', revenue: '₹19.5L' }
        ],
        dealerPerformance: [
            { id: 1, name: 'Sharma Paper Mart', revenue: '₹2,85,000', visits: 4, orders: 3, trend: 'growing', trendText: 'Growing ↗', trendClass: 'trend-indicator growing', actionBtnClass: 'action-btn small' },
            { id: 2, name: 'Modern Office Supplies', revenue: '₹2,45,000', visits: 3, orders: 2, trend: 'growing', trendText: 'Growing ↗', trendClass: 'trend-indicator growing', actionBtnClass: 'action-btn small' },
            { id: 3, name: 'Krishna Stationers', revenue: '₹1,98,000', visits: 4, orders: 4, trend: 'declining', trendText: 'Declining ↘', trendClass: 'trend-indicator declining', actionBtnClass: 'action-btn small urgent', isUrgent: true },
            { id: 4, name: 'Gupta Enterprises', revenue: '₹1,75,000', visits: 3, orders: 2, trend: 'growing', trendText: 'Growing ↗', trendClass: 'trend-indicator growing', actionBtnClass: 'action-btn small' }
        ],
        actionItems: [
            { id: 1, title: 'Focus on Sharma Paper Mart', detail: 'Low JK stock detected', suggestion: '✅ Suggested order: 500 reams JK Copier 75 GSM (₹2.45L potential)', icon: '🎯', buttonText: 'Set Priority', actionType: 'primary', dealerName: 'Sharma Paper Mart', itemClass: 'action-item', buttonClass: 'action-btn primary' },
            { id: 2, title: 'Visit Krishna Stationers urgently', detail: 'Revenue declined by 8%', suggestion: '📅 Schedule a meeting to identify concerns', icon: '🚨', buttonText: 'Schedule Meeting', actionType: 'urgent', dealerName: 'Krishna Stationers', isUrgent: true, itemClass: 'action-item urgent', buttonClass: 'action-btn urgent' },
            { id: 3, title: 'Promote JK Easy Copier', detail: '22% growth detected', suggestion: '🎯 Highlight in next 3 dealer visits', icon: '📈', buttonText: 'Add to Promotion List', actionType: 'primary', itemClass: 'action-item', buttonClass: 'action-btn primary' },
            { id: 4, title: 'Complete pending visits', detail: 'Visit compliance at risk', suggestion: '🔔 Visit 2 more dealers today to meet compliance target', icon: '📋', buttonText: 'View Pending Visits', actionType: 'default', itemClass: 'action-item', buttonClass: 'action-btn' }
        ],
        competitorAnalysis: []
    };

    connectedCallback() {
        this.loadAIInsights();
    }

    loadAIInsights() {
        this.isAILoading = true;
        this.aiLoadError = '';

        getFieldForceAIInsights()
            .then(result => {
                if (!result) return;
                if (result.kpis && result.kpis.length > 0) {
                    this.aiData = { ...this.aiData, kpis: result.kpis.map(kpi => ({ ...kpi, trendClass: `kpi-trend ${kpi.trendType || 'positive'}`, trendIcon: (kpi.trendType === 'negative' || String(kpi.trend || '').startsWith('-')) ? '↓' : '↑', progressStyle: `width: ${kpi.progress || 0}%` })) };
                }
                if (result.insights && result.insights.length > 0) {
                    this.aiData = { ...this.aiData, insights: result.insights.map((ins, i) => ({ id: ins.id || (i + 1), title: ins.title || 'Insight', priority: ins.priority || 'low', priorityLabel: (ins.priority || 'low').charAt(0).toUpperCase() + (ins.priority || 'low').slice(1) + ' Priority', cardClass: `insight-card ${ins.priority || 'low'}-priority`, priorityBadgeClass: `priority-badge ${ins.priority || 'low'}`, metric1Label: ins.metric1Label || '', metric1Value: ins.metric1Value || '', metric2Label: ins.metric2Label || '', metric2Value: ins.metric2Value || '', hasMetric2: !!(ins.metric2Label && ins.metric2Value), recommendation: ins.recommendation || '', impact: ins.impact || '', icon: ins.recommendationIcon || ins.icon || '💡', impactIcon: ins.impactIcon || '✅', impactClass: `impact-section${ins.isWarning ? ' warning' : ''}`, isWarning: ins.isWarning || false })) };
                }
                if (result.weeklyPerformance && result.weeklyPerformance.length > 0) {
                    this.aiData = { ...this.aiData, weeklyPerformance: result.weeklyPerformance.map(day => ({ ...day, summary: `${day.visits} visits · ${day.orders} orders · ${day.revenue}`, conversionClass: `table-cell ${day.trend || 'neutral'}` })) };
                }
                if (result.topProducts && result.topProducts.length > 0) {
                    this.aiData = { ...this.aiData, topProducts: result.topProducts };
                }
                if (result.dealerPerformance && result.dealerPerformance.length > 0) {
                    this.aiData = { ...this.aiData, dealerPerformance: result.dealerPerformance.map(d => ({ ...d, trendClass: `trend-indicator ${d.trend || 'growing'}`, trendText: d.trendText || (d.trend === 'declining' ? 'Declining ↘' : 'Growing ↗'), actionBtnClass: d.isUrgent ? 'action-btn small urgent' : 'action-btn small' })) };
                }
                if (result.actionItems && result.actionItems.length > 0) {
                    this.aiData = { ...this.aiData, actionItems: result.actionItems.map(item => ({ ...item, itemClass: `action-item${item.isUrgent ? ' urgent' : ''}`, buttonClass: `action-btn ${item.actionType || ''}` })) };
                }
                if (result.competitorAnalysis && result.competitorAnalysis.length > 0) {
                    this.aiData = { ...this.aiData, competitorAnalysis: result.competitorAnalysis.map((c, i) => {
                        const threat = (c.threatLevel || 'low').toLowerCase();
                        const priceAdv = c.priceAdvantage || 'equal';
                        const demand = (c.demandTrend || '').toLowerCase();
                        const pref = (c.dealerPreference || '').toLowerCase();
                        return { ...c, id: c.id || (i + 1), cardClass: `comp-card comp-card--${threat}`, threatBadgeClass: `comp-threat-badge comp-threat--${threat}`, threatLabel: threat.charAt(0).toUpperCase() + threat.slice(1) + ' Threat', priceDiffClass: priceAdv === 'we_cheaper' ? 'comp-metric-value price-advantage' : priceAdv === 'they_cheaper' ? 'comp-metric-value price-disadvantage' : 'comp-metric-value price-equal', demandBadgeClass: demand === 'rising' ? 'comp-tag-demand rising' : demand === 'falling' ? 'comp-tag-demand falling' : 'comp-tag-demand stable', prefBadgeClass: pref.includes('our') || pref.includes('we') ? 'comp-tag-pref us' : pref.includes('competitor') || pref.includes('them') ? 'comp-tag-pref them' : 'comp-tag-pref neutral', isPromoActive: (c.promoActive || '').toLowerCase() === 'yes' };
                    }) };
                }
                this.lastRefreshTime = new Date();
            })
            .catch(err => {
                this.aiLoadError = err?.body?.message || err?.message || 'Failed to load AI insights';
            })
            .finally(() => { this.isAILoading = false; });
    }

    refreshAIInsights() {
        this.loadAIInsights();
        this.dispatchEvent(new ShowToastEvent({ title: 'Refreshing', message: 'Fetching latest AI insights…', variant: 'info' }));
    }

    get hasCompetitorData() {
        return this.aiData.competitorAnalysis && this.aiData.competitorAnalysis.length > 0;
    }

    get competitorSummary() {
        const data = this.aiData.competitorAnalysis || [];
        return {
            total: data.length,
            highThreat: data.filter(c => c.threatLevel === 'high').length,
            mediumThreat: data.filter(c => c.threatLevel === 'medium').length,
            lowThreat: data.filter(c => c.threatLevel === 'low').length,
            weCheaper: data.filter(c => c.priceAdvantage === 'we_cheaper').length
        };
    }

    viewDealerRecommendations(event) {
        const dealerName = event.currentTarget.dataset.dealer;
        const dealer = this.aiData.dealerPerformance.find(d => d.name === dealerName);
        if (dealer) {
            this.dispatchEvent(new ShowToastEvent({
                title: `AI: ${dealer.name}`,
                message: dealer.trend === 'growing' ? 'Growing dealer — increase order frequency & premium products' : 'URGENT: Declining revenue — schedule immediate visit',
                variant: dealer.trend === 'growing' ? 'success' : 'error'
            }));
        }
    }

    exportWeeklyData() {
        this.dispatchEvent(new ShowToastEvent({ title: 'Export', message: 'Weekly performance report prepared for export', variant: 'success' }));
    }

    exportDealerData() {
        this.dispatchEvent(new ShowToastEvent({ title: 'Export', message: 'Dealer performance report generated', variant: 'success' }));
    }

    handleActionDispatch(event) {
        const type = event.currentTarget.dataset.type;
        const dealer = event.currentTarget.dataset.dealer;
        if (type === 'urgent' && dealer) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Meeting Scheduled', message: `Meeting scheduled with ${dealer}`, variant: 'success' }));
        } else {
            this.dispatchEvent(new ShowToastEvent({ title: 'Action', message: 'Action noted', variant: 'info' }));
        }
    }
}
