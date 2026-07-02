public with sharing class VisitDayPlanController {

    // ===============================
    // Wrapper for Day Summary
    // ===============================
    public class DayPlanResponse {
        @AuraEnabled public Integer planned;
        @AuraEnabled public Integer completed;
        @AuraEnabled public Integer pending;
        @AuraEnabled public Integer successRate;
        
        @AuraEnabled public Integer startTimeMs;
    @AuraEnabled public Integer endTimeMs;
    }

    // ===============================
    // DAY SUMMARY (Day View Header)
    // ===============================
    @AuraEnabled(cacheable=true)
public static DayPlanResponse getDayPlan(Date visitDate) {

    DayPlanResponse resp = new DayPlanResponse();
    resp.planned = 0;
    resp.completed = 0;
    resp.pending = 0;
    resp.successRate = 0;
    resp.startTimeMs = null;
    resp.endTimeMs = null;

    if (visitDate == null) {
        return resp;
    }

    List<Visit__c> visits = [
        SELECT Id, Visit_Status__c, Planned_Start_Time__c, Planned_End_Time__c
        FROM Visit__c
        WHERE Visit_Date__c = :visitDate
        AND OwnerId = :UserInfo.getUserId()
    ];

    resp.planned = visits.size();

    Integer completedCount = 0;

    Time minStart;
    Time maxEnd;

    for (Visit__c v : visits) {

        if (v.Visit_Status__c == 'Completed') {
            completedCount++;
        }

        if (v.Planned_Start_Time__c != null) {
            if (minStart == null || v.Planned_Start_Time__c < minStart) {
                minStart = v.Planned_Start_Time__c;
            }
        }

        if (v.Planned_End_Time__c != null) {
            if (maxEnd == null || v.Planned_End_Time__c > maxEnd) {
                maxEnd = v.Planned_End_Time__c;
            }
        }
    }

    resp.completed = completedCount;
    resp.pending = resp.planned - resp.completed;

    if (resp.planned > 0) {
        resp.successRate = Math.round(
            (Decimal.valueOf(resp.completed) / resp.planned) * 100
        );
    }

    // ✅ Convert Time → milliseconds from midnight
    if (minStart != null) {
        resp.startTimeMs =
            ((minStart.hour() * 60 * 60) + (minStart.minute() * 60) + minStart.second()) * 1000;
    }

    if (maxEnd != null) {
        resp.endTimeMs =
            ((maxEnd.hour() * 60 * 60) + (maxEnd.minute() * 60) + maxEnd.second()) * 1000;
    }

    return resp;
}



    // ===============================
    // DATE CAROUSEL COUNTS
    // ===============================
 @AuraEnabled(cacheable=true)
public static Map<String, Integer> getVisitCountsByDates(List<Date> dates) {

    Map<String, Integer> result = new Map<String, Integer>();
    if (dates == null || dates.isEmpty()) {
        return result;
    }

    Date minDate = dates[0];
    Date maxDate = dates[dates.size() - 1];

    for (AggregateResult ar : [
        SELECT Visit_Date__c visitDate, COUNT(Id) cnt
        FROM Visit__c
        WHERE Visit_Date__c >= :minDate
        AND Visit_Date__c <= :maxDate
        AND OwnerId = :UserInfo.getUserId()
        GROUP BY Visit_Date__c
    ]) {
        Date d = (Date) ar.get('visitDate');

        // ✅ FORCE yyyy-MM-dd (NOT locale dependent)
        String key =
            String.valueOf(d.year()) + '-' +
            String.valueOf(d.month()).leftPad(2, '0') + '-' +
            String.valueOf(d.day()).leftPad(2, '0');

        result.put(key, (Integer) ar.get('cnt'));
    }

    return result;
}



}