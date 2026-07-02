public with sharing class VisitDayVisitsController {

    // =========================================================
    // DTO
    // =========================================================
    public class VisitDTO {
        @AuraEnabled public Id     id;
        @AuraEnabled public Time   startTime;
        @AuraEnabled public String status;
        @AuraEnabled public String account;

        public VisitDTO(Id id, Time startTime, String status, String account) {
            this.id        = id;
            this.startTime = startTime;
            this.status    = status;
            this.account   = account;
        }
    }

    // =========================================================
    // GET VISITS FOR A SPECIFIC DATE
    // =========================================================
    @AuraEnabled(cacheable=true)
    public static List<VisitDTO> getDayVisits(String visitDateStr) {

        List<VisitDTO> result = new List<VisitDTO>();
        if (String.isBlank(visitDateStr)) return result;

        Date visitDate = Date.valueOf(visitDateStr);

        List<Visit__c> visits = [
            SELECT Id,
                   Planned_Start_Time__c,
                   Visit_Status__c,
                   Account__r.Name
            FROM   Visit__c
            WHERE  Visit_Date__c = :visitDate
              AND  OwnerId       = :UserInfo.getUserId()
            ORDER BY Planned_Start_Time__c ASC
        ];

        for (Visit__c v : visits) {
            result.add(
                new VisitDTO(
                    v.Id,
                    v.Planned_Start_Time__c,
                    v.Visit_Status__c,
                    v.Account__r != null ? v.Account__r.Name : '—'
                )
            );
        }
        return result;
    }

    // =========================================================
    // GET LAST 14 DAYS VISITS (dashboard + visit history modal)
    // =========================================================
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getLast14DaysVisits() {
        Date startDate = System.today().addDays(-13);

        List<Visit__c> visits = [
            SELECT Id,
                   Account__r.Name,
                   Visit_Status__c,
                   Visit_Date__c,
                   Planned_Start_Time__c
            FROM   Visit__c
            WHERE  Visit_Date__c >= :startDate
              AND  OwnerId       = :UserInfo.getUserId()
            ORDER BY Visit_Date__c DESC, Planned_Start_Time__c DESC
            LIMIT 200
        ];

        List<Map<String, Object>> data = new List<Map<String, Object>>();
        for (Visit__c v : visits) {
            Map<String, Object> row = new Map<String, Object>();
            row.put('id',        v.Id);
            row.put('account',   v.Account__r != null ? v.Account__r.Name : '—');
            row.put('status',    v.Visit_Status__c);
            row.put('startTime', v.Planned_Start_Time__c);
            row.put('time',      v.Visit_Date__c != null ? String.valueOf(v.Visit_Date__c) : '—');
            data.add(row);
        }
        return data;
    }

    // =========================================================
    // GET FULL VISIT DETAILS — used by visitDetailView component
    // Returns visit fields + related account info
    // =========================================================
    @AuraEnabled(cacheable=false)
    public static Map<String, Object> getVisitDetails(Id visitId) {

        Visit__c v = [
            SELECT Id,
                   Account__c,
                   Account__r.Name,
                   Account__r.Email__c,
                   Account__r.Phone,
                   Account__r.BillingStreet,
                   Account__r.BillingCity,
                   Account__r.BillingState,
                   Account__r.BillingCountry,
                   Visit_Date__c,
                   Visit_Status__c,
                   Visit_Purpose__c,
                   Planned_Start_Time__c,
                   Remarks__c,
                   Check_In_Time__c,
                   Check_In_Latitude__c,
                   Check_In_Longitude__c,
                   Check_Out_Time__c,
                   Check_Out_Latitude__c,
                   Check_Out_Longitude__c,
                   Planned_Duration__c
            FROM  Visit__c
            WHERE Id = :visitId
            LIMIT 1
        ];

        Map<String, Object> result = new Map<String, Object>();

        // ── Account fields ─────────────────────────────────────
        result.put('accountId',   v.Account__c);
        result.put('account',     v.Account__r?.Name);
        result.put('accountEmail', v.Account__r?.Email__c);
        result.put('phone',       v.Account__r?.Phone);

        // Build readable billing address
        List<String> addrParts = new List<String>();
        if (String.isNotBlank(v.Account__r?.BillingStreet))  addrParts.add(v.Account__r.BillingStreet);
        if (String.isNotBlank(v.Account__r?.BillingCity))    addrParts.add(v.Account__r.BillingCity);
        if (String.isNotBlank(v.Account__r?.BillingState))   addrParts.add(v.Account__r.BillingState);
        if (String.isNotBlank(v.Account__r?.BillingCountry)) addrParts.add(v.Account__r.BillingCountry);
        result.put('address', String.join(addrParts, ', '));

        // ── Visit fields ───────────────────────────────────────
        result.put('visitDate', v.Visit_Date__c);
        result.put('status',    v.Visit_Status__c);
        result.put('purpose',   v.Visit_Purpose__c);
        result.put('notes',     v.Remarks__c);

        // ── Check-in ──────────────────────────────────────────
        result.put('checkInTime',    v.Check_In_Time__c);
        if (v.Check_In_Latitude__c != null && v.Check_In_Longitude__c != null) {
            result.put('checkInCoords',
                String.valueOf(v.Check_In_Latitude__c) + ', ' +
                String.valueOf(v.Check_In_Longitude__c));
        }

        // ── Check-out ─────────────────────────────────────────
        result.put('checkOutTime',    v.Check_Out_Time__c);

        // ── Last Order for this Account ───────────────────────
        List<Order> lastOrders = [
            SELECT Id, OrderNumber, EffectiveDate
            FROM   Order
            WHERE  AccountId = :v.Account__c
            ORDER BY EffectiveDate DESC
            LIMIT 1
        ];
        if (!lastOrders.isEmpty() && lastOrders[0].EffectiveDate != null) {
            result.put('lastOrderDate', lastOrders[0].EffectiveDate.format());
        } else {
            result.put('lastOrderDate', '—');
        }

        // ── Outstanding balance (AggregateResult from Opportunity or custom) ──
        // Adjust if you have a custom Outstanding_Amount__c on Account
        result.put('outstandingAmount', '₹0');

        return result;
    }

    // =========================================================
    // CREATE VISIT
    // =========================================================
    @AuraEnabled
    public static Id createVisit(Id accountId, Date visitDate, Time plannedStartTime) {
        if (accountId == null) throw new AuraHandledException('Account is required');
        if (visitDate == null)  throw new AuraHandledException('Visit Date is required');

        Visit__c v = new Visit__c();
        v.Account__c    = accountId;
        v.Visit_Date__c = visitDate;
        if (plannedStartTime != null) v.Planned_Start_Time__c = plannedStartTime;
        v.Visit_Status__c = 'Planned';

        insert v;
        return v.Id;
    }

    // =========================================================
    // CHECK IN VISIT
    // =========================================================
    @AuraEnabled
    public static void checkInVisit(Id visitId, String lat, String lng, String address) {
        update new Visit__c(
            Id                    = visitId,
            Visit_Status__c       = 'In Progress',
            Check_In_Time__c      = DateTime.now(),
            Check_In_Latitude__c  = lat,
            Check_In_Longitude__c = lng
        );
    }

    // =========================================================
    // CHECK OUT VISIT
    // =========================================================
    @AuraEnabled
    public static void checkOutVisit(Id visitId, String lat, String lng, String address) {
        DateTime checkOut = DateTime.now();

        Visit__c existing = [
            SELECT Id, Check_In_Time__c
            FROM   Visit__c
            WHERE  Id = :visitId
            LIMIT 1
        ];

        Decimal durationMins = (existing.Check_In_Time__c != null)
            ? (checkOut.getTime() - existing.Check_In_Time__c.getTime()) / 60000
            : 0;

        update new Visit__c(
            Id                     = visitId,
            Visit_Status__c        = 'Completed',
            Check_Out_Time__c      = checkOut,
            Check_Out_Latitude__c  = lat,
            Check_Out_Longitude__c = lng,
            Planned_Duration__c    = durationMins
        );
    }

    // =========================================================
    // UPDATE VISIT NOTES / REMARKS
    // =========================================================
    @AuraEnabled
    public static void updateVisitNotes(Id visitId, String notes) {
        update new Visit__c(Id = visitId, Remarks__c = notes);
    }
}