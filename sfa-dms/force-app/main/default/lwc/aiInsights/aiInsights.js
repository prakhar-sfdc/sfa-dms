import { LightningElement, track } from 'lwc';
import getAIInsights from '@salesforce/apex/DealerInsightsService.getAIInsights';

export default class DealerAiInsights extends LightningElement {

    @track insights        = [];
    @track schemeInsights  = [];
    @track schemes         = [];
    @track kpis            = [];
    @track weeklyPerformance = [];
    @track topProducts     = [];
    @track recommendations = [];
    @track isLoading       = false;
    @track errorMessage    = '';

    gradientClasses = [
        'gradient-purple',
        'gradient-green',
        'gradient-pink',
        'gradient-blue',
        'gradient-purple',
        'gradient-blue'
    ];

    schemeGradients = [
        'scheme-grad-indigo',
        'scheme-grad-teal',
        'scheme-grad-amber',
        'scheme-grad-rose',
        'scheme-grad-violet'
    ];

    // ── Getters ───────────────────────────────────────────────────────────────
    get hasInsights()       { return this.insights.length > 0; }
    get hasSchemeInsights() { return this.schemeInsights.length > 0; }
    get hasSchemes()        { return this.schemes.length > 0; }
    get isEmpty()           { return !this.isLoading && !this.hasError && this.insights.length === 0; }
    get hasError()          { return !!this.errorMessage; }

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    connectedCallback() {
        this.loadInsights();
    }

    // ── Load Everything ───────────────────────────────────────────────────────
    async loadInsights() {
        this.isLoading     = true;
        this.errorMessage  = '';
        this.insights      = [];
        this.schemeInsights = [];
        this.schemes       = [];
        this.kpis          = [];
        this.weeklyPerformance = [];
        this.topProducts   = [];
        this.recommendations = [];

        try {
            const response = await getAIInsights();

            const cleaned = response
                .replace(/\u00A0/g, ' ')
                .replace(/[\u200B-\u200D\uFEFF]/g, '')
                .replace(/[\n\r\t]/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            const data = JSON.parse(cleaned);

            // KPIs
            if (Array.isArray(data.kpis)) {
                this.kpis = data.kpis;
            }

            // Weekly Performance
            if (Array.isArray(data.weeklyPerformance)) {
                this.weeklyPerformance = data.weeklyPerformance;
            }

            // Top Products
            if (Array.isArray(data.topProducts)) {
                this.topProducts = data.topProducts;
            }

            // AI Insights
            if (Array.isArray(data.insights)) {
                this.insights = data.insights.map((item, index) => {
                    const gradientName = this.gradientClasses[
                        Math.floor(Math.random() * this.gradientClasses.length)
                    ];
                    return {
                        id: index + 1,
                        title: item.title || 'Untitled',
                        description: item.description || '',
                        level: item.level || 'low',
                        cardClass: `insight-card glass-card ${gradientName}`
                    };
                });
            }

            // AI Recommendations
            if (Array.isArray(data.recommendations)) {
                this.recommendations = data.recommendations.map((rec, index) => ({
                    id: index + 1,
                    title: rec.title || '',
                    description: rec.description || ''
                }));
            }

            // ── Scheme Cards (from Apex, not AI) ─────────────────────────────
            if (Array.isArray(data.schemes)) {
                this.schemes = data.schemes.map((s, index) => {
                    const grad = this.schemeGradients[index % this.schemeGradients.length];
                    const expiring = s.status === 'expiring_soon';

                    return {
                        ...s,
                        cardClass: `scheme-card glass-card ${grad}${expiring ? ' scheme-expiring' : ''}`,
                        statusLabel: expiring ? `⚠ Ends in ${s.daysLeft} days` : 'Active',
                        statusBadgeClass: expiring ? 'scheme-status-badge expiring' : 'scheme-status-badge active',
                        daysLeftLabel: s.daysLeft != null ? `${s.daysLeft} days left` : null,
                        // Ensure boolean works with if:true / if:false
                        isApplied: s.isApplied === true
                    };
                });
            }

            // ── Scheme Insights (from Einstein) ──────────────────────────────
            if (Array.isArray(data.schemeInsights)) {
                this.schemeInsights = data.schemeInsights.map((si, index) => {
                    const grad = this.gradientClasses[index % this.gradientClasses.length];
                    return {
                        ...si,
                        cardClass: `insight-card glass-card ${grad}`
                    };
                });
            }

        } catch (error) {
            this.errorMessage = error?.body?.message
                || error?.message
                || 'Failed to load insights. Please try again.';
            console.error('AI Insights Error:', this.errorMessage);
        } finally {
            this.isLoading = false;
        }
    }

    // ── Retry ─────────────────────────────────────────────────────────────────
    handleRetry() {
        this.loadInsights();
    }
}