public with sharing class CompetitorAnalysisController {

    @AuraEnabled
    public static Id saveCompetitorAnalysis(
        Id      visitId,
        String  competitorName,
        String  competitorProduct,
        Decimal competitorPrice,
        Integer competitorStock,
        Integer ourStock,
        Decimal ourPrice,
        Decimal shelfSharePercent,
        String  displayVisibility,
        String  promoActive,
        String  dealerPreference,
        String  demandTrend,
        String  priceSensitivity,
        String  remarks
    ) {

        System.debug('Market competitor Analysis active');
        // Fetch Account from Visit
        Visit__c visit = [
            SELECT Id, Account__c
            FROM   Visit__c
            WHERE  Id = :visitId
            LIMIT  1
        ];

        Competitor_Market_Analysis__c rec = new Competitor_Market_Analysis__c(
            Visit__c              = visitId,
            Account__c            = visit.Account__c,
            Competitor_Name__c    = competitorName,
            Competitor_Product__c = competitorProduct,
            Competitor_Price__c   = competitorPrice,
            Competitor_Stock__c   = competitorStock,
            Our_Stock__c          = ourStock,
            Our_Price__c          = ourPrice,
            Shelf_Share_Percent__c= shelfSharePercent,
            Display_Visibility__c = displayVisibility,
            Promo_Scheme_Active__c       = promoActive,
            Dealer_Preference__c  = dealerPreference,
            Customer_Demand_Trend__c       = demandTrend,
            Price_Sensitivity__c  = priceSensitivity,
            Analysis_Date__c      = Date.today()
        );

        insert rec;
        return rec.Id;
    }

    @AuraEnabled(cacheable=true)
    public static List<Competitor_Market_Analysis__c> getVisitCompetitorAnalysis(Id visitId) {
        return [
            SELECT Id, Competitor_Name__c, Competitor_Product__c,
                   Competitor_Price__c, Our_Price__c,
                   Competitor_Stock__c, Our_Stock__c,
                   Shelf_Share_Percent__c, Display_Visibility__c,
                   Promo_Scheme_Active__c, Dealer_Preference__c,
                   Customer_Demand_Trend__c, Price_Sensitivity__c,
                   CreatedDate,
                   Price_Difference_INR__c, Stock_Ratio__c
            FROM   Competitor_Market_Analysis__c
            WHERE  Visit__c = :visitId
            ORDER BY CreatedDate DESC
        ];
    }
}