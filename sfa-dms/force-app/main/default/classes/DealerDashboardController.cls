public with sharing class DealerDashboardController {

    @AuraEnabled(cacheable=true)
public static List<OrderWrapper> getRecentOrders() {

    User u = [
        SELECT Id, AccountId
        FROM User
        WHERE Id = :UserInfo.getUserId()
    ];

    List<Order> orders = [
        SELECT Id, OrderNumber, Status
        FROM Order
        WHERE AccountId = :u.AccountId
           OR Tagged_By__c = :u.Id
        ORDER BY CreatedDate DESC
        LIMIT 4
    ];

    List<OrderWrapper> result = new List<OrderWrapper>();

    for(Order o : orders){
        result.add(new OrderWrapper(
            o.Id,
            '#' + o.OrderNumber,
            o.Status
        ));
    }

    return result;
}
     @AuraEnabled(cacheable=true)
public static Map<String, Object> getDashboardKPIs() {

    User u = [
        SELECT Id, AccountId
        FROM User
        WHERE Id = :UserInfo.getUserId()
    ];

    Map<String, Object> result = new Map<String, Object>();

    // TOTAL DEALERS
    Integer totalDealers = [
        SELECT COUNT()
        FROM Account
        WHERE RecordType.Name = 'Dealer'
        AND Onboarded_By__c = :u.Id
    ];

    // ACTIVE DEALERS
    Integer activeDealers = [
        SELECT COUNT()
        FROM Account
        WHERE RecordType.Name = 'Dealer'
        AND Dealer_Status__c = 'Active'
        AND Onboarded_By__c = :u.Id
    ];

    // TOTAL ORDERS
    Integer totalOrders = [
        SELECT COUNT()
        FROM Order
        WHERE AccountId = :u.AccountId
           OR Tagged_By__c = :u.Id
    ];

    // PENDING ORDERS
    Integer pendingOrders = [
        SELECT COUNT()
        FROM Order
        WHERE Status = 'Pending'
        AND (AccountId = :u.AccountId
             OR Tagged_By__c = :u.Id)
    ];

    // REVENUE
    AggregateResult revenueResult = [
        SELECT SUM(TotalAmount) total
        FROM Order
        WHERE AccountId = :u.AccountId
           OR Tagged_By__c = :u.Id
    ];

    Decimal revenue = (Decimal) revenueResult.get('total');

    result.put('totalDealers', totalDealers);
    result.put('activeDealers', activeDealers);
    result.put('totalOrders', totalOrders);
    result.put('pendingOrders', pendingOrders);
    result.put('revenue', revenue == null ? 0 : revenue);

    return result;
}

    public class OrderWrapper {
        @AuraEnabled public String recordId;
        @AuraEnabled public String orderNumber;
        @AuraEnabled public String status;

        public OrderWrapper(String recordId, String orderNumber, String status){
            this.recordId = recordId;
            this.orderNumber = orderNumber;
            this.status = status;
        }
    }

@AuraEnabled(cacheable=true)
public static List<Map<String, Object>> getOrdersByStatus() {
    User u = [
        SELECT Id, AccountId
        FROM User
        WHERE Id = :UserInfo.getUserId()
    ];

    List<Map<String, Object>> result = new List<Map<String, Object>>();

    List<AggregateResult> agg = [
        SELECT Status status, COUNT(Id) total
        FROM Order
        WHERE AccountId = :u.AccountId
           OR Tagged_By__c = :u.Id
        GROUP BY Status
    ];

    for (AggregateResult ar : agg) {
        result.add(new Map<String, Object>{
            'status' => (String) ar.get('status'),
            'count'  => (Integer) ar.get('total')
        });
    }

    return result;
}

@AuraEnabled(cacheable=true)
public static List<Map<String, Object>> getUpcomingDeliveries() {
    User u = [
        SELECT Id, AccountId
        FROM User
        WHERE Id = :UserInfo.getUserId()
    ];

    List<Map<String, Object>> result = new List<Map<String, Object>>();

    List<Order> orders = [
        SELECT Id, OrderNumber, Status,
               Estimated_Delivery_Date__c,
               Account.Name
        FROM Order
        WHERE Estimated_Delivery_Date__c >= TODAY
          AND Estimated_Delivery_Date__c <= NEXT_N_DAYS:30
          AND (AccountId = :u.AccountId OR Tagged_By__c = :u.Id)
        ORDER BY Estimated_Delivery_Date__c ASC
        LIMIT 4
    ];

    for (Order o : orders) {
        Integer daysLeft = Date.today().daysBetween(o.Estimated_Delivery_Date__c);
        String urgency = daysLeft <= 3 ? 'urgent' : daysLeft <= 7 ? 'soon' : 'normal';

        result.add(new Map<String, Object>{
            'id'           => o.Id,
            'orderNumber'  => '#' + o.OrderNumber,
            'status'       => o.Status,
            'dealerName'   => o.Account.Name,
            'deliveryDate' => o.Estimated_Delivery_Date__c != null
                                ? o.Estimated_Delivery_Date__c.format()
                                : '',
            'daysLeft'     => daysLeft,
            'urgency'      => urgency
        });
    }

    return result;
}
   @AuraEnabled(cacheable=true)
public static List<Map<String, Object>> getTopDealers() {

    User u = [
        SELECT Id
        FROM User
        WHERE Id = :UserInfo.getUserId()
    ];

    List<Map<String, Object>> result = new List<Map<String, Object>>();

    List<AggregateResult> agg = [
        SELECT AccountId dealerId,
               Account.Name dealerName,
               SUM(TotalAmount) totalRevenue
        FROM Order
        WHERE RecordType.DeveloperName = 'Secondary'
        AND AccountId != NULL
        AND Tagged_By__c = :u.Id
        GROUP BY AccountId, Account.Name
        ORDER BY SUM(TotalAmount) DESC
        LIMIT 5
    ];

    for (AggregateResult ar : agg) {

        result.add(new Map<String, Object>{
            'id' => ar.get('dealerId'),
            'name' => ar.get('dealerName'),
            'revenue' => ar.get('totalRevenue')
        });
    }

    return result;
}

@AuraEnabled(cacheable=true)
public static List<Map<String, Object>> getDealersByRegion() {
    User u = [
    SELECT Id, AccountId
    FROM User
    WHERE Id = :UserInfo.getUserId()
];

    List<Map<String, Object>> result = new List<Map<String, Object>>();

    List<AggregateResult> agg = [
        SELECT Territory__c region, COUNT(Id) total
        FROM Account
        WHERE RecordType.Name = 'Dealer'
AND Onboarded_By__c = :u.Id
        GROUP BY Territory__c
    ];

    for (AggregateResult ar : agg) {
        result.add(new Map<String, Object>{
            'region' => (String) ar.get('region'),
            'count' => (Integer) ar.get('total')
        });
    }

    return result;
}

@AuraEnabled(cacheable=true)
public static List<Map<String, Object>> getRevenueByMonth() {
    User u = [
    SELECT Id, AccountId
    FROM User
    WHERE Id = :UserInfo.getUserId()
];

    List<Map<String, Object>> result = new List<Map<String, Object>>();

    List<AggregateResult> agg = [
        SELECT CALENDAR_MONTH(CreatedDate) month,
               SUM(TotalAmount) total
        FROM Order
        WHERE CreatedDate = THIS_YEAR
AND (AccountId = :u.AccountId OR Tagged_By__c = :u.Id)
        GROUP BY CALENDAR_MONTH(CreatedDate)
        ORDER BY CALENDAR_MONTH(CreatedDate)
    ];

    for (AggregateResult ar : agg) {
        result.add(new Map<String, Object>{
            'month' => (Integer) ar.get('month'),
            'total' => (Decimal) ar.get('total')
        });
    }

    return result;
}

@AuraEnabled(cacheable=true)
public static List<Map<String, Object>> getTopProducts() {

User u = [
    SELECT Id, AccountId
    FROM User
    WHERE Id = :UserInfo.getUserId()
];
    List<Map<String, Object>> result = new List<Map<String, Object>>();

    List<AggregateResult> agg = [
        SELECT Product2.Name name, SUM(Quantity) qty
        FROM OrderItem
        WHERE Order.AccountId = :u.AccountId
   OR Order.Tagged_By__c = :u.Id
        GROUP BY Product2.Name
        ORDER BY SUM(Quantity) DESC
        LIMIT 5
    ];

    for (AggregateResult ar : agg) {
        result.add(new Map<String, Object>{
            'name' => (String) ar.get('name'),
            'qty' => (Decimal) ar.get('qty')
        });
    }

    return result;
}

@AuraEnabled(cacheable=true)
public static List<Map<String, Object>> getLowInventory() {
    User u = [
    SELECT Id, AccountId
    FROM User
    WHERE Id = :UserInfo.getUserId()
];

    List<Map<String, Object>> result = new List<Map<String, Object>>();

    List<Dealer_Inventory__c> records = [
        SELECT Id,
               Product__r.Name,
               Available_Stock__c
        FROM Dealer_Inventory__c
        WHERE Available_Stock__c < 200
AND Distributor__c = :u.AccountId
        ORDER BY Available_Stock__c ASC
        LIMIT 10
    ];

    for (Dealer_Inventory__c rec : records) {

        Map<String, Object> row = new Map<String, Object>();

        row.put('id', rec.Id);
        row.put('name', rec.Product__r.Name);
        row.put('stock', rec.Available_Stock__c);
        row.put('isCritical', rec.Available_Stock__c < 50);

        result.add(row);
    }

    return result;
}

@AuraEnabled(cacheable=true)
public static Map<String, Object> getCreditLimitData() {
    User u = [
        SELECT Id, AccountId
        FROM User
        WHERE Id = :UserInfo.getUserId()
    ];

    if (u.AccountId == null) {
        return new Map<String, Object>{
            'creditLimit' => 0,
            'utilized'    => 0,
            'available'   => 0,
            'creditStatus'=> 'N/A'
        };
    }

    Account acc = [
        SELECT Credit_Limit__c
        FROM Account
        WHERE Id = :u.AccountId
        LIMIT 1
    ];

    AggregateResult utilRes = [
        SELECT SUM(TotalAmount) total
        FROM Order
        WHERE AccountId = :u.AccountId
          AND Status = 'Dispatched'
    ];

    Decimal creditLimit = acc.Credit_Limit__c != null ? acc.Credit_Limit__c : 0;
    Decimal utilized    = (Decimal) utilRes.get('total');
    if (utilized == null) utilized = 0;

    Decimal available = creditLimit - utilized;

    String status;
    if (available < 0) {
        status = 'Over Limit';
    } else if (creditLimit > 0 && available < creditLimit * 0.2) {
        status = 'Critical';
    } else {
        status = 'Healthy';
    }

    return new Map<String, Object>{
        'creditLimit'  => creditLimit,
        'utilized'     => utilized,
        'available'    => available,
        'creditStatus' => status
    };
}
}