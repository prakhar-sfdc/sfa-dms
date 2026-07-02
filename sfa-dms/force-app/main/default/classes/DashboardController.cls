public with sharing class DashboardController {

    /* ===============================
     * DTO: Recent Visit
     * =============================== */
    public class RecentVisitDTO {
        @AuraEnabled public String account;
        @AuraEnabled public Date visitDate;
        @AuraEnabled public String status;
    }

    /* ===============================
     * DTO: Dashboard Response
     * =============================== */
    public class DashboardResponse {

        // ---- MAIN METRICS ----
        @AuraEnabled public Integer todayVisits;
        @AuraEnabled public Integer monthlyVisits;
        @AuraEnabled public Integer totalAccounts;
        @AuraEnabled public Integer activeDealers;
        @AuraEnabled public Decimal monthlyRevenue; // placeholder (0 for now)
        @AuraEnabled public Integer pendingExpenses;
        @AuraEnabled public Integer awaitingApproval;

        // ---- ATTENDANCE COMPLIANCE ----
        @AuraEnabled public Integer presentDays;
        @AuraEnabled public Integer workingDays;
        @AuraEnabled public Integer onTimeDays;
        @AuraEnabled public Integer compliancePercent;

        // ---- RECENT VISITS ----
        @AuraEnabled public List<RecentVisitDTO> recentVisits;
    }

    /* ===============================
     * MAIN METHOD
     * =============================== */
    @AuraEnabled(cacheable=true)
    public static DashboardResponse getDashboardData() {

        Id userId = UserInfo.getUserId();
        Date today = Date.today();
        Date monthStart = today.toStartOfMonth();

        DashboardResponse resp = new DashboardResponse();

        /* ===============================
         * VISITS METRICS
         * =============================== */

        // Today's Visits
        resp.todayVisits = [
            SELECT COUNT()
            FROM Visit__c
            WHERE OwnerId = :userId
            AND Visit_Date__c = :today
        ];

        // Monthly Visits
        resp.monthlyVisits = [
            SELECT COUNT()
            FROM Visit__c
            WHERE OwnerId = :userId
            AND Visit_Date__c >= :monthStart
        ];
        
        

        // Active Dealers (Distinct Accounts from Visits)
        AggregateResult arDealer = [
            SELECT COUNT_DISTINCT(Account__c) cnt
            FROM Visit__c
            WHERE OwnerId = :userId
        ];
        resp.activeDealers = (Integer) arDealer.get('cnt');

        // Total Accounts (Org-wide)
        resp.totalAccounts = [
            SELECT COUNT()
            FROM Account
        ];

        // Revenue placeholder (not implemented yet)
        resp.monthlyRevenue = 0;

        /* ===============================
         * ATTENDANCE COMPLIANCE
         * =============================== */

        List<Attendance__c> attendanceList = [
            SELECT On_Time__c
            FROM Attendance__c
            WHERE User__c = :userId
            AND Attendance_Date__c >= :monthStart
        ];

        resp.presentDays = attendanceList.size();
        resp.workingDays = today.day(); // days passed in month
        resp.onTimeDays = 0;

        for (Attendance__c a : attendanceList) {
            if (a.On_Time__c == true) {
                resp.onTimeDays++;
            }
        }

        if (resp.workingDays > 0) {
            resp.compliancePercent = Math.round(
                (Decimal.valueOf(resp.presentDays) / resp.workingDays) * 100
            );
        } else {
            resp.compliancePercent = 0;
        }

        /* ===============================
         * EXPENSE METRICS
         * =============================== */

        // Pending / Awaiting Approval Expenses
        resp.pendingExpenses = [
            SELECT COUNT()
            FROM Expense__c
            WHERE OwnerId = :userId
            AND Status__c = 'Submitted'
        ];

        resp.awaitingApproval = resp.pendingExpenses;

        /* ===============================
         * RECENT VISITS (Dashboard)
         * =============================== */

        resp.recentVisits = new List<RecentVisitDTO>();

        for (Visit__c v : [
            SELECT Visit_Date__c,
                   Visit_Status__c,
                   Account__r.Name
            FROM Visit__c
            WHERE OwnerId = :userId
            ORDER BY Visit_Date__c DESC
            LIMIT 5
        ]) {
            RecentVisitDTO dto = new RecentVisitDTO();
            dto.account = v.Account__r != null ? v.Account__r.Name : '—';
            dto.visitDate = v.Visit_Date__c;
            dto.status = v.Visit_Status__c;
            resp.recentVisits.add(dto);
        }

        return resp;
    }
}