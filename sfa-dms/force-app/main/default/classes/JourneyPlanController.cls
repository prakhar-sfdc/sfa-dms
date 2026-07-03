/**
 * JourneyPlanController
 * -----------------------------------------------------------------------------
 * Enterprise Journey Plan (PJP) + Visit Execution service for the kloudracSFA app.
 * Operates on Journey_Plan__c (one per rep per day) and its Journey_Plan_Item__c
 * children (individual planned stops).
 *
 * Route intelligence (computed server-side from real GPS + timestamps):
 *   - Distance_From_Previous__c    : straight-line km between consecutive check-ins (Haversine)
 *   - Travel_Time_From_Previous__c : minutes between previous check-out and this check-in
 *   - Actual_Visit_Duration__c     : on-site minutes (check-out - check-in)
 * Rolled up on the parent plan: Total_Distance__c, Total_Travel_Time__c,
 *   Actual_Duration__c (on-site), Planned/Completed/Pending_Visits__c, Success_Rate__c.
 */
public with sharing class JourneyPlanController {

    private static final Set<String> DONE_STATUSES = new Set<String>{ 'Completed' };

    // =========================================================================
    // WRAPPERS
    // =========================================================================
    public class PlanDay {
        @AuraEnabled public String planId;
        @AuraEnabled public String planDate;
        @AuraEnabled public String status;
        @AuraEnabled public Integer plannedVisits = 0;
        @AuraEnabled public Integer completedVisits = 0;
        @AuraEnabled public Integer pendingVisits = 0;
        @AuraEnabled public Decimal successRate = 0;
        @AuraEnabled public Decimal totalDistance = 0;      // km
        @AuraEnabled public Integer totalTravelTime = 0;    // minutes
        @AuraEnabled public Integer estimatedDuration = 0;  // minutes
        @AuraEnabled public Integer actualDuration = 0;     // on-site minutes
        @AuraEnabled public List<DayItem> items = new List<DayItem>();
    }

    public class DayItem {
        @AuraEnabled public String id;
        @AuraEnabled public String accountId;
        @AuraEnabled public String accountName;
        @AuraEnabled public String location;
        @AuraEnabled public Decimal accountLat;
        @AuraEnabled public Decimal accountLng;
        @AuraEnabled public String plannedTime;   // HH:mm
        @AuraEnabled public Integer visitOrder;
        @AuraEnabled public String priority;       // High/Medium/Low
        @AuraEnabled public String status;         // Scheduled/In Progress/Completed/Skipped
        @AuraEnabled public String purpose;
        @AuraEnabled public Integer estimatedDuration;
        @AuraEnabled public String checkInTime;
        @AuraEnabled public String checkOutTime;
        @AuraEnabled public Decimal checkInLat;
        @AuraEnabled public Decimal checkInLng;
        @AuraEnabled public Decimal checkOutLat;
        @AuraEnabled public Decimal checkOutLng;
        @AuraEnabled public String checkInAddress;
        @AuraEnabled public String checkOutAddress;
        @AuraEnabled public Decimal distanceFromPrev;
        @AuraEnabled public Integer travelFromPrev;
        @AuraEnabled public Integer actualDuration;
        @AuraEnabled public String outcome;
        @AuraEnabled public String notes;
    }

    public class MarketAnalysis {
        @AuraEnabled public String id;
        @AuraEnabled public String competitorName;
        @AuraEnabled public String competitorProduct;
        @AuraEnabled public String ourProduct;
        @AuraEnabled public Decimal competitorPrice;
        @AuraEnabled public Decimal ourPrice;
        @AuraEnabled public Decimal priceDifference;
        @AuraEnabled public Integer competitorStock;
        @AuraEnabled public Integer ourStock;
        @AuraEnabled public Decimal shelfShare;
        @AuraEnabled public String displayVisibility;
        @AuraEnabled public String promoActive;
        @AuraEnabled public String dealerPreference;
        @AuraEnabled public String demandTrend;
        @AuraEnabled public String priceSensitivity;
        @AuraEnabled public String analysisDate;
    }

    public class WeekDay {
        @AuraEnabled public String dateStr;
        @AuraEnabled public String dayName;
        @AuraEnabled public Integer planned = 0;
        @AuraEnabled public Integer completed = 0;
        @AuraEnabled public Decimal distance = 0;
        @AuraEnabled public Boolean isToday = false;
    }

    public class MonthDay {
        @AuraEnabled public String dateStr;
        @AuraEnabled public Integer dayNum;
        @AuraEnabled public Integer planned = 0;
        @AuraEnabled public Integer completed = 0;
        @AuraEnabled public List<String> events = new List<String>();
    }

    public class AccountOption {
        @AuraEnabled public String id;
        @AuraEnabled public String name;
        @AuraEnabled public String location;
        @AuraEnabled public String priority;
    }

    public class UploadResult {
        @AuraEnabled public Integer plansCreated = 0;
        @AuraEnabled public Integer itemsCreated = 0;
        @AuraEnabled public Integer rowsSkipped = 0;
        @AuraEnabled public List<String> errors = new List<String>();
    }

    // =========================================================================
    // READ — DAY
    // =========================================================================
    @AuraEnabled
    public static PlanDay getDayPlan(String planDate) {
        Date d = Date.valueOf(planDate);
        Id uid = UserInfo.getUserId();

        PlanDay result = new PlanDay();
        result.planDate = String.valueOf(d);

        List<Journey_Plan__c> plans = [
            SELECT Id, Status__c, Planned_Visits__c, Completed_Visits__c, Pending_Visits__c,
                   Success_Rate__c, Total_Distance__c, Total_Travel_Time__c,
                   Estimated_Duration__c, Actual_Duration__c
            FROM Journey_Plan__c
            WHERE Plan_Date__c = :d AND OwnerId = :uid
            LIMIT 1
        ];

        if (!plans.isEmpty()) {
            Journey_Plan__c p = plans[0];
            result.planId = p.Id;
            result.status = p.Status__c;
            result.plannedVisits = toInt(p.Planned_Visits__c);
            result.completedVisits = toInt(p.Completed_Visits__c);
            result.pendingVisits = toInt(p.Pending_Visits__c);
            result.successRate = p.Success_Rate__c != null ? p.Success_Rate__c : 0;
            result.totalDistance = p.Total_Distance__c != null ? p.Total_Distance__c : 0;
            result.totalTravelTime = toInt(p.Total_Travel_Time__c);
            result.estimatedDuration = toInt(p.Estimated_Duration__c);
            result.actualDuration = toInt(p.Actual_Duration__c);
        }

        for (Journey_Plan_Item__c i : queryItemsForDate(d, uid)) {
            result.items.add(toDayItem(i));
        }
        return result;
    }

    // =========================================================================
    // READ — WEEK
    // =========================================================================
    @AuraEnabled
    public static List<WeekDay> getWeekPlan(String weekStart) {
        Date start = Date.valueOf(weekStart);
        Date endD = start.addDays(6);
        Id uid = UserInfo.getUserId();

        Map<Date, Journey_Plan__c> byDate = new Map<Date, Journey_Plan__c>();
        for (Journey_Plan__c p : [
            SELECT Plan_Date__c, Planned_Visits__c, Completed_Visits__c, Total_Distance__c
            FROM Journey_Plan__c
            WHERE Plan_Date__c >= :start AND Plan_Date__c <= :endD AND OwnerId = :uid
        ]) {
            byDate.put(p.Plan_Date__c, p);
        }

        List<WeekDay> out = new List<WeekDay>();
        for (Integer i = 0; i < 7; i++) {
            Date d = start.addDays(i);
            WeekDay wd = new WeekDay();
            wd.dateStr = String.valueOf(d);
            wd.dayName = Datetime.newInstance(d, Time.newInstance(0,0,0,0)).format('EEE');
            wd.isToday = (d == Date.today());
            Journey_Plan__c p = byDate.get(d);
            if (p != null) {
                wd.planned = toInt(p.Planned_Visits__c);
                wd.completed = toInt(p.Completed_Visits__c);
                wd.distance = p.Total_Distance__c != null ? p.Total_Distance__c : 0;
            }
            out.add(wd);
        }
        return out;
    }

    // =========================================================================
    // READ — MONTH
    // =========================================================================
    @AuraEnabled
    public static List<MonthDay> getMonthPlan(Integer year, Integer month) {
        Date start = Date.newInstance(year, month, 1);
        Date endD = start.addMonths(1).addDays(-1);
        Id uid = UserInfo.getUserId();

        Map<Date, MonthDay> byDate = new Map<Date, MonthDay>();
        Integer days = start.daysBetween(endD) + 1;
        for (Integer i = 0; i < days; i++) {
            Date d = start.addDays(i);
            MonthDay md = new MonthDay();
            md.dateStr = String.valueOf(d);
            md.dayNum = d.day();
            byDate.put(d, md);
        }

        for (Journey_Plan__c p : [
            SELECT Plan_Date__c, Planned_Visits__c, Completed_Visits__c
            FROM Journey_Plan__c
            WHERE Plan_Date__c >= :start AND Plan_Date__c <= :endD AND OwnerId = :uid
        ]) {
            MonthDay md = byDate.get(p.Plan_Date__c);
            if (md != null) {
                md.planned = toInt(p.Planned_Visits__c);
                md.completed = toInt(p.Completed_Visits__c);
            }
        }

        // A couple of representative events per day (earliest planned stops)
        for (Journey_Plan_Item__c i : [
            SELECT Account__r.Name, Planned_Visit_Time__c, Journey_Plan__r.Plan_Date__c
            FROM Journey_Plan_Item__c
            WHERE Journey_Plan__r.Plan_Date__c >= :start
              AND Journey_Plan__r.Plan_Date__c <= :endD
              AND Journey_Plan__r.OwnerId = :uid
            ORDER BY Visit_Order__c ASC NULLS LAST
        ]) {
            MonthDay md = byDate.get(i.Journey_Plan__r.Plan_Date__c);
            if (md != null && md.events.size() < 2) {
                String t = i.Planned_Visit_Time__c != null ? formatTime(i.Planned_Visit_Time__c) : '';
                md.events.add((t == '' ? '' : t + ' · ') + i.Account__r.Name);
            }
        }

        return byDate.values();
    }

    // =========================================================================
    // READ — CALENDAR BADGE COUNTS (real)
    // =========================================================================
    @AuraEnabled
    public static Map<String,Integer> getVisitCountsForRange(String startDate, String endDate) {
        Date s = Date.valueOf(startDate);
        Date e = Date.valueOf(endDate);
        Id uid = UserInfo.getUserId();
        Map<String,Integer> out = new Map<String,Integer>();
        for (Journey_Plan__c p : [
            SELECT Plan_Date__c, Planned_Visits__c
            FROM Journey_Plan__c
            WHERE Plan_Date__c >= :s AND Plan_Date__c <= :e AND OwnerId = :uid
        ]) {
            out.put(String.valueOf(p.Plan_Date__c), toInt(p.Planned_Visits__c));
        }
        return out;
    }

    // =========================================================================
    // READ — ACCOUNT PICKER (builder)
    // =========================================================================
    @AuraEnabled(cacheable=true)
    public static List<AccountOption> searchAccounts(String searchKey) {
        String key = '%' + (searchKey == null ? '' : searchKey.trim()) + '%';
        List<AccountOption> out = new List<AccountOption>();
        for (Account a : [
            SELECT Id, Name, BillingCity, Priority__c
            FROM Account
            WHERE Name LIKE :key
            ORDER BY Name
            LIMIT 25
        ]) {
            AccountOption o = new AccountOption();
            o.id = a.Id;
            o.name = a.Name;
            o.location = a.BillingCity;
            o.priority = a.Priority__c;
            out.add(o);
        }
        return out;
    }

    // =========================================================================
    // WRITE — ADD / REORDER / DELETE
    // =========================================================================
    @AuraEnabled
    public static String addVisit(String accountId, String planDate, String plannedTime,
                                  String purpose, String priority) {
        Date d = Date.valueOf(planDate);
        Id planId = ensurePlan(d);

        Integer nextOrder = 1;
        for (AggregateResult ar : [
            SELECT MAX(Visit_Order__c) mx FROM Journey_Plan_Item__c WHERE Journey_Plan__c = :planId
        ]) {
            Object mx = ar.get('mx');
            if (mx != null) nextOrder = Integer.valueOf(mx) + 1;
        }

        Journey_Plan_Item__c item = new Journey_Plan_Item__c(
            Journey_Plan__c = planId,
            Account__c = accountId,
            User__c = UserInfo.getUserId(),
            Planned_Visit_Time__c = parseTime(plannedTime),
            Visit_Purpose__c = purpose,
            Priority__c = String.isBlank(priority) ? 'Medium' : priority,
            Visit_Status__c = 'Scheduled',
            Visit_Order__c = nextOrder,
            Estimated_Duration__c = 30
        );
        insert item;
        recalcPlan(planId);
        return item.Id;
    }

    @AuraEnabled
    public static void reorderVisits(List<String> orderedItemIds) {
        List<Journey_Plan_Item__c> updates = new List<Journey_Plan_Item__c>();
        Integer order = 1;
        for (String id : orderedItemIds) {
            updates.add(new Journey_Plan_Item__c(Id = id, Visit_Order__c = order));
            order++;
        }
        if (!updates.isEmpty()) update updates;
    }

    @AuraEnabled
    public static void deleteVisit(String itemId) {
        Journey_Plan_Item__c item = [
            SELECT Id, Journey_Plan__c FROM Journey_Plan_Item__c WHERE Id = :itemId LIMIT 1
        ];
        Id planId = item.Journey_Plan__c;
        delete item;
        recalcPlan(planId);
    }

    // =========================================================================
    // WRITE — PJP CSV UPLOAD  (base64 file content)
    // Expected columns (header row, case-insensitive): Account, Date, Time, Purpose, Priority
    // Date: yyyy-MM-dd. Time: HH:mm (24h). Account matched by exact Name.
    // =========================================================================
    @AuraEnabled
    public static UploadResult uploadPlanCsv(String base64Content) {
        UploadResult res = new UploadResult();
        String content = EncodingUtil.base64Decode(base64Content).toString();
        List<String> lines = content.split('\r\n|\n|\r');
        if (lines.isEmpty()) { res.errors.add('File is empty'); return res; }

        // Header mapping
        List<String> header = splitCsvLine(lines[0]);
        Map<String,Integer> col = new Map<String,Integer>();
        for (Integer i = 0; i < header.size(); i++) {
            col.put(header[i].trim().toLowerCase(), i);
        }
        if (!col.containsKey('account') || !col.containsKey('date')) {
            res.errors.add('CSV must contain at least "Account" and "Date" columns');
            return res;
        }

        // Collect distinct account names to resolve to Ids
        Set<String> names = new Set<String>();
        List<List<String>> dataRows = new List<List<String>>();
        for (Integer r = 1; r < lines.size(); r++) {
            if (String.isBlank(lines[r])) continue;
            List<String> cells = splitCsvLine(lines[r]);
            dataRows.add(cells);
            String nm = safeCell(cells, col.get('account'));
            if (String.isNotBlank(nm)) names.add(nm);
        }

        Map<String,Id> nameToId = new Map<String,Id>();
        for (Account a : [SELECT Id, Name FROM Account WHERE Name IN :names]) {
            nameToId.put(a.Name.toLowerCase(), a.Id);
        }

        // Ensure plans per date, then build items
        Map<Date, Id> planByDate = new Map<Date, Id>();
        List<Journey_Plan_Item__c> toInsert = new List<Journey_Plan_Item__c>();
        Map<Date, Integer> orderByDate = new Map<Date, Integer>();

        for (List<String> cells : dataRows) {
            String nm = safeCell(cells, col.get('account'));
            String dateStr = safeCell(cells, col.get('date'));
            if (String.isBlank(nm) || String.isBlank(dateStr)) { res.rowsSkipped++; continue; }

            Id accId = nameToId.get(nm.toLowerCase());
            if (accId == null) { res.rowsSkipped++; res.errors.add('Account not found: ' + nm); continue; }

            Date d;
            try { d = Date.valueOf(dateStr.trim()); }
            catch (Exception ex) { res.rowsSkipped++; res.errors.add('Bad date: ' + dateStr); continue; }

            if (!planByDate.containsKey(d)) {
                planByDate.put(d, ensurePlan(d));
                orderByDate.put(d, currentMaxOrder(planByDate.get(d)));
            }
            Integer ord = orderByDate.get(d) + 1;
            orderByDate.put(d, ord);

            Journey_Plan_Item__c item = new Journey_Plan_Item__c(
                Journey_Plan__c = planByDate.get(d),
                Account__c = accId,
                User__c = UserInfo.getUserId(),
                Visit_Status__c = 'Scheduled',
                Visit_Order__c = ord,
                Estimated_Duration__c = 30,
                Priority__c = normalizePriority(safeCell(cells, col.get('priority'))),
                Visit_Purpose__c = blankToNull(safeCell(cells, col.get('purpose')))
            );
            Time t = parseTime(safeCell(cells, col.get('time')));
            if (t != null) item.Planned_Visit_Time__c = t;
            toInsert.add(item);
        }

        if (!toInsert.isEmpty()) insert toInsert;
        res.plansCreated = planByDate.size();
        res.itemsCreated = toInsert.size();
        for (Id pid : planByDate.values()) recalcPlan(pid);
        return res;
    }

    // =========================================================================
    // EXECUTION — CHECK IN  (captures GPS, computes distance + travel from prev)
    // =========================================================================
    @AuraEnabled
    public static DayItem checkInItem(String itemId, Decimal lat, Decimal lng, String address) {
        Journey_Plan_Item__c item = [
            SELECT Id, Journey_Plan__c, Visit_Order__c, Actual_Check_In_Time__c, Visit_Status__c
            FROM Journey_Plan_Item__c WHERE Id = :itemId LIMIT 1
        ];
        if (item.Actual_Check_In_Time__c == null) {
            item.Actual_Check_In_Time__c = System.now();
        }
        item.Check_In_Latitude__c = lat;
        item.Check_In_Longitude__c = lng;
        item.Check_In_Address__c = address;
        item.Visit_Status__c = 'In Progress';

        // Previous completed stop on the same plan (highest order below this with a check-out)
        Journey_Plan_Item__c prev = findPreviousStop(item.Journey_Plan__c, item.Visit_Order__c);
        if (prev != null) {
            if (prev.Check_Out_Latitude__c != null && prev.Check_Out_Longitude__c != null
                && lat != null && lng != null) {
                item.Distance_From_Previous__c = haversineKm(
                    prev.Check_Out_Latitude__c, prev.Check_Out_Longitude__c, lat, lng);
            }
            if (prev.Actual_Check_Out_Time__c != null) {
                Long ms = item.Actual_Check_In_Time__c.getTime() - prev.Actual_Check_Out_Time__c.getTime();
                if (ms > 0) item.Travel_Time_From_Previous__c = Integer.valueOf(ms / 60000);
            }
        }
        update item;
        recalcPlan(item.Journey_Plan__c);
        return getItemDetail(item.Id);
    }

    // =========================================================================
    // EXECUTION — CHECK OUT  (computes on-site duration, rolls up plan)
    // =========================================================================
    @AuraEnabled
    public static DayItem checkOutItem(String itemId, Decimal lat, Decimal lng,
                                       String address, String outcome, String notes) {
        Journey_Plan_Item__c item = [
            SELECT Id, Journey_Plan__c, Actual_Check_In_Time__c
            FROM Journey_Plan_Item__c WHERE Id = :itemId LIMIT 1
        ];
        DateTime outTime = System.now();
        item.Actual_Check_Out_Time__c = outTime;
        item.Check_Out_Latitude__c = lat;
        item.Check_Out_Longitude__c = lng;
        item.Check_Out_Address__c = address;
        item.Visit_Status__c = 'Completed';
        if (String.isNotBlank(outcome)) item.Visit_Outcome__c = outcome;
        if (String.isNotBlank(notes)) item.Visit_Notes__c = notes;

        if (item.Actual_Check_In_Time__c != null) {
            Long ms = outTime.getTime() - item.Actual_Check_In_Time__c.getTime();
            if (ms > 0) item.Actual_Visit_Duration__c = Integer.valueOf(ms / 60000);
        }
        update item;
        recalcPlan(item.Journey_Plan__c);
        return getItemDetail(item.Id);
    }

    @AuraEnabled
    public static void saveVisitOutcome(String itemId, String outcome, String notes) {
        update new Journey_Plan_Item__c(Id = itemId, Visit_Outcome__c = outcome, Visit_Notes__c = notes);
    }

    // =========================================================================
    // READ — SINGLE ITEM DETAIL
    // =========================================================================
    @AuraEnabled
    public static DayItem getItemDetail(String itemId) {
        List<Journey_Plan_Item__c> items = queryItemsById(new Set<Id>{ (Id)itemId });
        return items.isEmpty() ? null : toDayItem(items[0]);
    }

    // =========================================================================
    // MARKET / COMPETITOR ANALYSIS  (multiple per visit item)
    // =========================================================================
    @AuraEnabled
    public static String saveMarketAnalysis(String itemId, String competitorName, String competitorProduct,
            String ourProduct, Decimal competitorPrice, Decimal ourPrice, Integer competitorStock,
            Integer ourStock, Decimal shelfShare, String displayVisibility, String promoActive,
            String dealerPreference, String demandTrend, String priceSensitivity) {

        Journey_Plan_Item__c item = [
            SELECT Id, Account__c FROM Journey_Plan_Item__c WHERE Id = :itemId LIMIT 1
        ];
        Competitor_Market_Analysis__c rec = new Competitor_Market_Analysis__c(
            Journey_Plan_Item__c   = item.Id,
            Account__c             = item.Account__c,
            Competitor_Name__c     = competitorName,
            Competitor_Product__c  = competitorProduct,
            Our_Product__c         = ourProduct,
            Competitor_Price__c    = competitorPrice,
            Our_Price__c           = ourPrice,
            Competitor_Stock__c    = competitorStock,
            Our_Stock__c           = ourStock,
            Shelf_Share_Percent__c = shelfShare,
            Display_Visibility__c  = blankToNull(displayVisibility),
            Promo_Scheme_Active__c = blankToNull(promoActive),
            Dealer_Preference__c   = blankToNull(dealerPreference),
            Customer_Demand_Trend__c = blankToNull(demandTrend),
            Price_Sensitivity__c   = blankToNull(priceSensitivity),
            Analysis_Date__c       = Date.today()
        );
        insert rec;
        return rec.Id;
    }

    @AuraEnabled
    public static List<MarketAnalysis> getItemAnalyses(String itemId) {
        List<MarketAnalysis> out = new List<MarketAnalysis>();
        for (Competitor_Market_Analysis__c r : [
            SELECT Id, Competitor_Name__c, Competitor_Product__c, Our_Product__c,
                   Competitor_Price__c, Our_Price__c, Price_Difference_INR__c,
                   Competitor_Stock__c, Our_Stock__c, Shelf_Share_Percent__c,
                   Display_Visibility__c, Promo_Scheme_Active__c, Dealer_Preference__c,
                   Customer_Demand_Trend__c, Price_Sensitivity__c, Analysis_Date__c
            FROM Competitor_Market_Analysis__c
            WHERE Journey_Plan_Item__c = :itemId
            ORDER BY CreatedDate DESC
        ]) {
            MarketAnalysis m = new MarketAnalysis();
            m.id = r.Id;
            m.competitorName = r.Competitor_Name__c;
            m.competitorProduct = r.Competitor_Product__c;
            m.ourProduct = r.Our_Product__c;
            m.competitorPrice = r.Competitor_Price__c;
            m.ourPrice = r.Our_Price__c;
            m.priceDifference = r.Price_Difference_INR__c;
            m.competitorStock = toInt(r.Competitor_Stock__c);
            m.ourStock = toInt(r.Our_Stock__c);
            m.shelfShare = r.Shelf_Share_Percent__c;
            m.displayVisibility = r.Display_Visibility__c;
            m.promoActive = r.Promo_Scheme_Active__c;
            m.dealerPreference = r.Dealer_Preference__c;
            m.demandTrend = r.Customer_Demand_Trend__c;
            m.priceSensitivity = r.Price_Sensitivity__c;
            m.analysisDate = r.Analysis_Date__c != null ? String.valueOf(r.Analysis_Date__c) : null;
            out.add(m);
        }
        return out;
    }

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================
    private static List<Journey_Plan_Item__c> queryItemsForDate(Date d, Id uid) {
        return [
            SELECT Id, Account__c, Account__r.Name, Account__r.BillingCity, Account__r.BillingStreet,
                   Account__r.BillingState, Account__r.BillingLatitude, Account__r.BillingLongitude,
                   Planned_Visit_Time__c, Visit_Order__c, Priority__c, Visit_Status__c, Visit_Purpose__c,
                   Estimated_Duration__c, Actual_Check_In_Time__c, Actual_Check_Out_Time__c,
                   Check_In_Latitude__c, Check_In_Longitude__c, Check_Out_Latitude__c, Check_Out_Longitude__c,
                   Check_In_Address__c, Check_Out_Address__c, Distance_From_Previous__c,
                   Travel_Time_From_Previous__c, Actual_Visit_Duration__c, Visit_Outcome__c, Visit_Notes__c
            FROM Journey_Plan_Item__c
            WHERE Journey_Plan__r.Plan_Date__c = :d AND Journey_Plan__r.OwnerId = :uid
            ORDER BY Visit_Order__c ASC NULLS LAST
        ];
    }

    private static List<Journey_Plan_Item__c> queryItemsById(Set<Id> ids) {
        return [
            SELECT Id, Account__c, Account__r.Name, Account__r.BillingCity, Account__r.BillingStreet,
                   Account__r.BillingState, Account__r.BillingLatitude, Account__r.BillingLongitude,
                   Planned_Visit_Time__c, Visit_Order__c, Priority__c, Visit_Status__c, Visit_Purpose__c,
                   Estimated_Duration__c, Actual_Check_In_Time__c, Actual_Check_Out_Time__c,
                   Check_In_Latitude__c, Check_In_Longitude__c, Check_Out_Latitude__c, Check_Out_Longitude__c,
                   Check_In_Address__c, Check_Out_Address__c, Distance_From_Previous__c,
                   Travel_Time_From_Previous__c, Actual_Visit_Duration__c, Visit_Outcome__c, Visit_Notes__c
            FROM Journey_Plan_Item__c WHERE Id IN :ids
        ];
    }

    private static DayItem toDayItem(Journey_Plan_Item__c i) {
        DayItem di = new DayItem();
        di.id = i.Id;
        di.accountId = i.Account__c;
        di.accountName = i.Account__r != null ? i.Account__r.Name : null;
        di.location = i.Account__r != null ? buildLocation(i) : null;
        di.accountLat = i.Account__r != null ? i.Account__r.BillingLatitude : null;
        di.accountLng = i.Account__r != null ? i.Account__r.BillingLongitude : null;
        di.plannedTime = i.Planned_Visit_Time__c != null ? formatTime(i.Planned_Visit_Time__c) : null;
        di.visitOrder = toInt(i.Visit_Order__c);
        di.priority = i.Priority__c;
        di.status = i.Visit_Status__c;
        di.purpose = i.Visit_Purpose__c;
        di.estimatedDuration = toInt(i.Estimated_Duration__c);
        di.checkInTime = i.Actual_Check_In_Time__c != null ? formatDateTime(i.Actual_Check_In_Time__c) : null;
        di.checkOutTime = i.Actual_Check_Out_Time__c != null ? formatDateTime(i.Actual_Check_Out_Time__c) : null;
        di.checkInLat = i.Check_In_Latitude__c;
        di.checkInLng = i.Check_In_Longitude__c;
        di.checkOutLat = i.Check_Out_Latitude__c;
        di.checkOutLng = i.Check_Out_Longitude__c;
        di.checkInAddress = i.Check_In_Address__c;
        di.checkOutAddress = i.Check_Out_Address__c;
        di.distanceFromPrev = i.Distance_From_Previous__c;
        di.travelFromPrev = toInt(i.Travel_Time_From_Previous__c);
        di.actualDuration = toInt(i.Actual_Visit_Duration__c);
        di.outcome = i.Visit_Outcome__c;
        di.notes = i.Visit_Notes__c;
        return di;
    }

    private static String buildLocation(Journey_Plan_Item__c i) {
        List<String> parts = new List<String>();
        if (String.isNotBlank(i.Account__r.BillingCity)) parts.add(i.Account__r.BillingCity);
        if (String.isNotBlank(i.Account__r.BillingState)) parts.add(i.Account__r.BillingState);
        return String.join(parts, ', ');
    }

    private static Id ensurePlan(Date d) {
        Id uid = UserInfo.getUserId();
        List<Journey_Plan__c> plans = [
            SELECT Id FROM Journey_Plan__c WHERE Plan_Date__c = :d AND OwnerId = :uid LIMIT 1
        ];
        if (!plans.isEmpty()) return plans[0].Id;
        Journey_Plan__c p = new Journey_Plan__c(Plan_Date__c = d, Status__c = 'Planned');
        insert p;
        return p.Id;
    }

    private static Integer currentMaxOrder(Id planId) {
        for (AggregateResult ar : [
            SELECT MAX(Visit_Order__c) mx FROM Journey_Plan_Item__c WHERE Journey_Plan__c = :planId
        ]) {
            Object mx = ar.get('mx');
            if (mx != null) return Integer.valueOf(mx);
        }
        return 0;
    }

    private static Journey_Plan_Item__c findPreviousStop(Id planId, Decimal order) {
        if (order == null) return null;
        List<Journey_Plan_Item__c> prev = [
            SELECT Id, Visit_Order__c, Actual_Check_Out_Time__c,
                   Check_Out_Latitude__c, Check_Out_Longitude__c
            FROM Journey_Plan_Item__c
            WHERE Journey_Plan__c = :planId
              AND Visit_Order__c < :order
              AND Actual_Check_Out_Time__c != null
            ORDER BY Visit_Order__c DESC
            LIMIT 1
        ];
        return prev.isEmpty() ? null : prev[0];
    }

    private static void recalcPlan(Id planId) {
        List<Journey_Plan_Item__c> items = [
            SELECT Visit_Status__c, Distance_From_Previous__c, Travel_Time_From_Previous__c,
                   Actual_Visit_Duration__c, Estimated_Duration__c
            FROM Journey_Plan_Item__c WHERE Journey_Plan__c = :planId
        ];
        Integer planned = items.size();
        Integer completed = 0;
        Integer inProgress = 0;
        Decimal totalDist = 0;
        Integer totalTravel = 0;
        Integer actualDur = 0;
        Integer estDur = 0;
        for (Journey_Plan_Item__c i : items) {
            if (i.Visit_Status__c == 'Completed') completed++;
            if (i.Visit_Status__c == 'In Progress') inProgress++;
            if (i.Distance_From_Previous__c != null) totalDist += i.Distance_From_Previous__c;
            if (i.Travel_Time_From_Previous__c != null) totalTravel += toInt(i.Travel_Time_From_Previous__c);
            if (i.Actual_Visit_Duration__c != null) actualDur += toInt(i.Actual_Visit_Duration__c);
            if (i.Estimated_Duration__c != null) estDur += toInt(i.Estimated_Duration__c);
        }
        Journey_Plan__c p = new Journey_Plan__c(Id = planId);
        p.Planned_Visits__c = planned;
        p.Completed_Visits__c = completed;
        p.Pending_Visits__c = planned - completed;
        // Success_Rate__c is a formula on the counts above — do not set directly.
        p.Total_Distance__c = totalDist.setScale(2);
        p.Total_Travel_Time__c = totalTravel;
        p.Actual_Duration__c = actualDur;
        p.Estimated_Duration__c = estDur;
        if (completed == planned && planned > 0) p.Status__c = 'Completed';
        else if (completed > 0 || inProgress > 0) p.Status__c = 'In Progress';
        else p.Status__c = 'Planned';
        update p;
    }

    // Haversine — straight-line distance in km
    private static Decimal haversineKm(Decimal lat1, Decimal lon1, Decimal lat2, Decimal lon2) {
        Double r = 6371;
        Double dLat = toRad(lat2 - lat1);
        Double dLon = toRad(lon2 - lon1);
        Double a = Math.sin(dLat/2) * Math.sin(dLat/2)
                 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2))
                 * Math.sin(dLon/2) * Math.sin(dLon/2);
        Double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return Decimal.valueOf(r * c).setScale(2);
    }
    private static Double toRad(Decimal deg) { return (Double)deg * Math.PI / 180; }

    // ---- small utilities ----
    private static Integer toInt(Decimal d) { return d == null ? 0 : Integer.valueOf(d); }

    private static Time parseTime(String s) {
        if (String.isBlank(s)) return null;
        String v = s.trim().toUpperCase();
        Boolean pm = v.contains('PM');
        Boolean am = v.contains('AM');
        v = v.replace('AM','').replace('PM','').trim();
        List<String> parts = v.split(':');
        if (parts.isEmpty()) return null;
        try {
            Integer h = Integer.valueOf(parts[0].trim());
            Integer m = parts.size() > 1 ? Integer.valueOf(parts[1].trim()) : 0;
            if (pm && h < 12) h += 12;
            if (am && h == 12) h = 0;
            if (h < 0 || h > 23 || m < 0 || m > 59) return null;
            return Time.newInstance(h, m, 0, 0);
        } catch (Exception e) { return null; }
    }

    private static String formatTime(Time t) {
        DateTime dt = DateTime.newInstance(Date.today(), t);
        return dt.format('h:mm a');
    }
    private static String formatDateTime(DateTime dt) {
        return dt.format('h:mm a');
    }

    private static List<String> splitCsvLine(String line) {
        // simple CSV: no quoted commas expected in these files
        return line.split(',', -1);
    }
    private static String safeCell(List<String> cells, Integer idx) {
        if (idx == null || idx < 0 || idx >= cells.size()) return null;
        return cells[idx] == null ? null : cells[idx].trim();
    }
    private static String blankToNull(String s) { return String.isBlank(s) ? null : s.trim(); }
    private static String normalizePriority(String s) {
        if (String.isBlank(s)) return 'Medium';
        String v = s.trim().toLowerCase();
        if (v.startsWith('h')) return 'High';
        if (v.startsWith('l')) return 'Low';
        return 'Medium';
    }
}
