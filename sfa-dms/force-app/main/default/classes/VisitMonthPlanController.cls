public with sharing class VisitMonthPlanController {

    // ===============================
    // Wrapper for single visit
    // ===============================
    public class MonthVisitItem {
        @AuraEnabled public String visitTime;   // ✅ renamed
        @AuraEnabled public String accountName;
    }

    // ===============================
    // Wrapper for Month Response
    // ===============================
    public class MonthPlanResponse {
        @AuraEnabled public Map<String, List<MonthVisitItem>> calendarData;
        @AuraEnabled public Integer totalDays;
        @AuraEnabled public Integer totalVisits;
        @AuraEnabled public Integer totalAccounts;
    }

    // ===============================
    // MONTH VIEW DATA
    // ===============================
    @AuraEnabled(cacheable=true)
    public static MonthPlanResponse getMonthPlan(Integer year, Integer month) {

        MonthPlanResponse resp = new MonthPlanResponse();
        resp.calendarData = new Map<String, List<MonthVisitItem>>();
        resp.totalVisits = 0;

        if (year == null || month == null) {
            return resp;
        }

        Date startDate = Date.newInstance(year, month, 1);
        Date endDate = startDate.addMonths(1).addDays(-1);

        resp.totalDays = endDate.day();

        // ✅ NO time field assumption
        List<Visit__c> visits = [
            SELECT Id,
                   Visit_Date__c,
                   Account__c,
                   Account__r.Name
            FROM Visit__c
            WHERE Visit_Date__c >= :startDate
            AND Visit_Date__c <= :endDate
            AND OwnerId = :UserInfo.getUserId()
            ORDER BY Visit_Date__c
        ];

        Set<Id> uniqueAccounts = new Set<Id>();

        for (Visit__c v : visits) {
            resp.totalVisits++;

            if (v.Account__c != null) {
                uniqueAccounts.add(v.Account__c);
            }

            String dateKey =
                String.valueOf(v.Visit_Date__c.year()) + '-' +
                String.valueOf(v.Visit_Date__c.month()).leftPad(2, '0') + '-' +
                String.valueOf(v.Visit_Date__c.day()).leftPad(2, '0');

            if (!resp.calendarData.containsKey(dateKey)) {
                resp.calendarData.put(dateKey, new List<MonthVisitItem>());
            }

            MonthVisitItem item = new MonthVisitItem();
            item.visitTime = ''; // placeholder (frontend can hide if empty)
            item.accountName = v.Account__r != null ? v.Account__r.Name : '—';

            resp.calendarData.get(dateKey).add(item);
        }

        resp.totalAccounts = uniqueAccounts.size();
        return resp;
    }
}