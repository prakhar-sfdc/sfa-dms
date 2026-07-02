public with sharing class JourneyPlanController {

    /* =========================================================
       DAY SUMMARY
    ========================================================= */
    @AuraEnabled(cacheable=true)
    public static Journey_Plan__c getTodayJourneyPlan(String planDate) {

        Date d = Date.valueOf(planDate);

        List<Journey_Plan__c> plans = [
            SELECT Id,
                   Plan_Date__c,
                   Planned_Visits__c,
                   Completed_Visits__c,
                   Pending_Visits__c,
                   Status__c,
                   Success_Rate__c
            FROM Journey_Plan__c
            WHERE Plan_Date__c = :d
            AND OwnerId = :UserInfo.getUserId()
            LIMIT 1
        ];

        return plans.isEmpty() ? null : plans[0];
    }

    /* =========================================================
       DAY VISITS (RIGHT PANEL)
    ========================================================= */
    @AuraEnabled(cacheable=true)
    public static List<Journey_Plan_Item__c> getDailyPlanItems(String planDate) {

        Date d = Date.valueOf(planDate);

        return [
            SELECT Id,
                   Account__r.Name,
                   Planned_Visit_Time__c,
                   Visit_Purpose__c,
                   Visit_Status__c,
                   Priority__c,
                   Visit_Order__c
            FROM Journey_Plan_Item__c
            WHERE Journey_Plan__r.Plan_Date__c = :d
            AND Journey_Plan__r.OwnerId = :UserInfo.getUserId()
            ORDER BY Visit_Order__c ASC NULLS LAST
        ];
    }

    /* =========================================================
       PRIORITY ACCOUNTS (LEFT PANEL)
    ========================================================= */
    @AuraEnabled(cacheable=true)
    public static List<Map<String,Object>> getPriorityAccountsByDate(String planDate) {

        Date d = Date.valueOf(planDate);

        List<Journey_Plan_Item__c> items = [
            SELECT Account__r.Id,
                   Account__r.Name,
                   Account__r.BillingCity,
                   Priority__c,
                   Visit_Status__c
            FROM Journey_Plan_Item__c
            WHERE Journey_Plan__r.Plan_Date__c = :d
            AND Journey_Plan__r.OwnerId = :UserInfo.getUserId()
            AND Visit_Status__c != 'Completed'
            ORDER BY Priority__c DESC
            LIMIT 5
        ];

        List<Map<String,Object>> result = new List<Map<String,Object>>();

        for (Journey_Plan_Item__c i : items) {
            result.add(new Map<String,Object>{
                'id'       => i.Account__r.Id,
                'name'     => i.Account__r.Name,
                'location' => i.Account__r.BillingCity,
                'priority' => i.Priority__c != null ? i.Priority__c.toLowerCase() : 'medium',
                'status'   => i.Visit_Status__c
            });
        }

        return result;
    }

    /* =========================================================
       CAROUSEL COUNTS
    ========================================================= */
    @AuraEnabled(cacheable=true)
    public static Map<String,Integer> getVisitCountsByDates(List<String> planDates) {

        List<Date> dates = new List<Date>();
        for (String s : planDates) {
            dates.add(Date.valueOf(s));
        }

        Map<String,Integer> result = new Map<String,Integer>();

        for (Journey_Plan__c plan : [
            SELECT Plan_Date__c, Planned_Visits__c
            FROM Journey_Plan__c
            WHERE Plan_Date__c IN :dates
            AND OwnerId = :UserInfo.getUserId()
        ]) {
            result.put(
                String.valueOf(plan.Plan_Date__c),
                plan.Planned_Visits__c != null ? Integer.valueOf(plan.Planned_Visits__c) : 0
            );
        }

        return result;
    }

    /* =========================================================
       WEEK SUMMARY
    ========================================================= */
    @AuraEnabled(cacheable=true)
    public static List<Map<String,Object>> getWeekJourneyPlans(String startDate) {

        Date start = Date.valueOf(startDate);
        Date endDate = start.addDays(6);

        Map<Date, Journey_Plan__c> planMap = new Map<Date, Journey_Plan__c>();

        for (Journey_Plan__c p : [
            SELECT Plan_Date__c, Planned_Visits__c, Completed_Visits__c
            FROM Journey_Plan__c
            WHERE Plan_Date__c >= :start
            AND Plan_Date__c <= :endDate
            AND OwnerId = :UserInfo.getUserId()
        ]) {
            planMap.put(p.Plan_Date__c, p);
        }

        List<Map<String,Object>> result = new List<Map<String,Object>>();

        for (Integer i = 0; i < 7; i++) {
            Date d = start.addDays(i);
            Journey_Plan__c p = planMap.get(d);

            result.add(new Map<String,Object>{
                'date'      => String.valueOf(d),
                'dayName' => Datetime.newInstance(d, Time.newInstance(0, 0, 0, 0)).format('EEE'),
                'visits'    => p != null ? p.Planned_Visits__c : 0,
                'completed' => p != null ? p.Completed_Visits__c : 0,
                'isToday'   => d == Date.today()
            });
        }

        return result;
    }

    /* =========================================================
       MONTH COUNTS
    ========================================================= */
    @AuraEnabled(cacheable=true)
    public static Map<String,Integer> getMonthVisitCounts(Integer year, Integer month) {

        Date start = Date.newInstance(year, month, 1);
        Date endDate = start.addMonths(1).addDays(-1);

        Map<String,Integer> result = new Map<String,Integer>();

        for (Journey_Plan__c p : [
            SELECT Plan_Date__c, Planned_Visits__c
            FROM Journey_Plan__c
            WHERE Plan_Date__c >= :start
            AND Plan_Date__c <= :endDate
            AND OwnerId = :UserInfo.getUserId()
        ]) {
            result.put(
                String.valueOf(p.Plan_Date__c),
                p.Planned_Visits__c != null ? Integer.valueOf(p.Planned_Visits__c) : 0
            );
        }

        return result;
    }
}