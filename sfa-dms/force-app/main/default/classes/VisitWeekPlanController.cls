public with sharing class VisitWeekPlanController {

    /* ===============================
     * DTO: Single Visit (Detail View)
     * =============================== */
    public class VisitDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public Date visitDate;
        @AuraEnabled public Time startTime;
        @AuraEnabled public String status;
        @AuraEnabled public String account;
        @AuraEnabled public String purpose;

        public VisitDTO(
            Id id,
            Date visitDate,
            Time startTime,
            String status,
            String account,
            String purpose
        ) {
            this.id = id;
            this.visitDate = visitDate;
            this.startTime = startTime;
            this.status = status;
            this.account = account;
            this.purpose = purpose;
        }
    }

    /* ===============================
     * Wrapper: Week Response
     * =============================== */
    public class WeekResponse {
        @AuraEnabled public Map<String, Integer> dayVisitCount;
        @AuraEnabled public List<VisitDTO> visits;

        public WeekResponse() {
            dayVisitCount = new Map<String, Integer>();
            visits = new List<VisitDTO>();
        }
    }

    /* ===============================
     * MAIN METHOD
     * =============================== */
    @AuraEnabled(cacheable=true)
    public static WeekResponse getWeekVisits(String startDateStr) {

        WeekResponse response = new WeekResponse();

        if (String.isBlank(startDateStr)) {
            return response;
        }

        Date startDate = Date.valueOf(startDateStr);
        Date endDate   = startDate.addDays(6); // 7-day week

        /* ===============================
         * QUERY ALL VISITS OF THE WEEK
         * =============================== */
        List<Visit__c> visits = [
            SELECT Id,
                   Visit_Date__c,
                   Planned_Start_Time__c,
                   Visit_Status__c,
            Visit_Purpose__c, 
                   Account__r.Name
            FROM Visit__c
            WHERE Visit_Date__c >= :startDate
              AND Visit_Date__c <= :endDate
              AND OwnerId = :UserInfo.getUserId()
            ORDER BY Visit_Date__c, Planned_Start_Time__c
        ];

        /* ===============================
         * BUILD RESPONSE
         * =============================== */
        for (Visit__c v : visits) {

            // ---------- yyyy-MM-dd key ----------
            String dateKey =
                String.valueOf(v.Visit_Date__c.year()) + '-' +
                String.valueOf(v.Visit_Date__c.month()).leftPad(2, '0') + '-' +
                String.valueOf(v.Visit_Date__c.day()).leftPad(2, '0');

            // ---------- TOTAL VISIT COUNT (hover) ----------
            if (!response.dayVisitCount.containsKey(dateKey)) {
                response.dayVisitCount.put(dateKey, 0);
            }
            response.dayVisitCount.put(
                dateKey,
                response.dayVisitCount.get(dateKey) + 1
            );

            // ---------- VISIT DETAILS (schedule) ----------
            response.visits.add(
                new VisitDTO(
                    v.Id,
                    v.Visit_Date__c,
                    v.Planned_Start_Time__c,
                    v.Visit_Status__c,
                    v.Account__r != null ? v.Account__r.Name : '—',
                    v.Visit_Purpose__c != null ? v.Visit_Purpose__c : '—'
                )
            );
        }

        return response;
    }
}