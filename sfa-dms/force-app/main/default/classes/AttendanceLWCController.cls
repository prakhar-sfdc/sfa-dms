public with sharing class AttendanceLWCController {

    @AuraEnabled
    public static Id handleCheckIn(String lat, String lng, String address) {
        Id userId = UserInfo.getUserId();
        Date today = Date.today();

        List<Attendance__c> existingAtt = [
            SELECT Id FROM Attendance__c
            WHERE User__c = :userId AND Attendance_Date__c = :today
            LIMIT 1
        ];

        if (!existingAtt.isEmpty()) {
            return existingAtt[0].Id;
        }

        Attendance__c att = new Attendance__c();
        att.User__c = userId;
        att.Attendance_Date__c = today;
        att.Check_In_Time__c = System.now();
        att.Check_In_Address__c = address;
        att.Check_In_Latitude__c = lat;
        att.Check_In_Longitude__c = lng;
        att.Status__c = 'Checked In';

        Time cutoff = Time.newInstance(9, 30, 0, 0);
        Time checkInTime = att.Check_In_Time__c.time();
        att.On_Time__c = (checkInTime <= cutoff);

        insert att;
        return att.Id;
    }


  @AuraEnabled
public static void handleCheckOut(Id recordId, String lat, String lng, String address) {
    Attendance__c att = [
        SELECT Id, Check_In_Time__c
        FROM Attendance__c
        WHERE Id = :recordId
        LIMIT 1
    ];

    // ✅ FIX: store real DateTime
    att.Check_Out_Time__c = System.now();

    att.Check_Out_Address__c = address;
    att.Check_Out_Latitude__c = lat;
    att.Check_Out_Longitude__c = lng;
    att.Status__c = 'Checked Out';

    if (att.Check_In_Time__c != null) {
        Long diffMs = att.Check_Out_Time__c.getTime() - att.Check_In_Time__c.getTime();
        Decimal mins = diffMs / (1000 * 60);
        att.Work_Duration__c = mins.setScale(2);
    }

    update att;
}


    @AuraEnabled(cacheable=true)
    public static Attendance__c getTodayAttendance() {
        List<Attendance__c> attList = [
            SELECT Id, Check_In_Time__c, Check_Out_Time__c, Check_In_Address__c, Check_Out_Address__c,
                   Check_In_Latitude__c, Check_In_Longitude__c, Check_Out_Latitude__c, Check_Out_Longitude__c,
                   Status__c, Work_Duration__c, On_Time__c
            FROM Attendance__c
            WHERE User__c = :UserInfo.getUserId()
            AND Attendance_Date__c = :Date.today()
            LIMIT 1
        ];
        return attList.isEmpty() ? null : attList[0];
    }

    @AuraEnabled(cacheable=true)
    public static List<Attendance__c> getRecentAttendance() {
        return [
            SELECT Id, Attendance_Date__c, Check_In_Time__c, Check_Out_Time__c,
                   Check_In_Address__c, Check_Out_Address__c,
                   Check_In_Latitude__c, Check_In_Longitude__c,
                   Check_Out_Latitude__c, Check_Out_Longitude__c,
                   Status__c, Work_Duration__c, On_Time__c
            FROM Attendance__c
            WHERE User__c = :UserInfo.getUserId()
            ORDER BY Attendance_Date__c DESC
            LIMIT 10
        ];
    }

@AuraEnabled
public static List<Map<String, Object>> getLast7DayCompliance() {

    Id userId = UserInfo.getUserId();
    Date today = Date.today();
    Date startDate = today.addDays(-6);

    List<Attendance__c> records = [
        SELECT Attendance_Date__c,
               On_Time__c
        FROM Attendance__c
        WHERE User__c = :userId
        AND Attendance_Date__c >= :startDate
        AND Attendance_Date__c <= :today
    ];

    Map<Date, Attendance__c> attendanceByDate = new Map<Date, Attendance__c>();
    for (Attendance__c a : records) {
        attendanceByDate.put(a.Attendance_Date__c, a);
    }

    List<Map<String, Object>> result = new List<Map<String, Object>>();

    for (Integer i = 6; i >= 0; i--) {
        Date d = today.addDays(-i);

        String status = 'Absent';
        Integer value = 0;

        if (attendanceByDate.containsKey(d)) {
            Attendance__c att = attendanceByDate.get(d);

            if (att.On_Time__c == true) {
                status = 'On Time';
                value = 100;
            } else {
                status = 'Late';
                value = 0;
            }
        }

        result.add(new Map<String, Object>{
            'date' => d,
           'dayLabel' => DateTime.newInstance(d, Time.newInstance(0, 0, 0, 0)).format('E'),
            'status' => status,
            'value' => value
        });
    }

    return result;
}


    @AuraEnabled(cacheable=true)
public static List<Attendance__c> getAttendanceLast14Days() {

    Date today = Date.today();
    Date startDate = today.addDays(-13); // last 14 days including today

    return [
        SELECT Id, Attendance_Date__c, Check_In_Time__c, Check_Out_Time__c,
               Check_In_Address__c, Check_Out_Address__c,
               Check_In_Latitude__c, Check_In_Longitude__c,
               Check_Out_Latitude__c, Check_Out_Longitude__c,
               Status__c, Work_Duration__c, On_Time__c
        FROM Attendance__c
        WHERE User__c = :UserInfo.getUserId()
        AND Attendance_Date__c >= :startDate
        ORDER BY Attendance_Date__c DESC
        LIMIT 100
    ];
}

    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getDashboardAttendanceCompliance() {

        Date startDate = Date.today().toStartOfMonth();
        Date endDate = startDate.addMonths(1).addDays(-1);

        // ✅ Fetch current month attendance records for current user
        List<Attendance__c> attList = [
            SELECT Id, Attendance_Date__c, Check_In_Time__c, Status__c
            FROM Attendance__c
            WHERE CreatedById = :UserInfo.getUserId()
            AND Attendance_Date__c >= :startDate
            AND Attendance_Date__c <= :endDate
        ];

        Integer totalDays = attList.size();
        Integer presentDays = 0;
        Integer onTimeDays = 0;

        // ✅ On-time rule: Check-in <= 10:00 AM
        Time onTimeLimit = Time.newInstance(10, 0, 0, 0);

        for (Attendance__c a : attList) {

            // ✅ present (Checked In or Checked Out)
            if (a.Status__c == 'Checked In' || a.Status__c == 'Checked Out') {
                presentDays++;
            }

            // ✅ on-time calculation
            if (a.Check_In_Time__c != null) {
                Time checkInTime = a.Check_In_Time__c.time();
                if (checkInTime <= onTimeLimit) {
                    onTimeDays++;
                }
            }
        }

        Integer compliancePercent = 0;
        if (presentDays > 0) {
            compliancePercent = Integer.valueOf(
                Math.round(((Decimal)onTimeDays / (Decimal)presentDays) * 100)
            );
        }

        Map<String, Object> res = new Map<String, Object>();
        res.put('totalDays', totalDays);
        res.put('presentDays', presentDays);
        res.put('onTimeDays', onTimeDays);
        res.put('compliancePercent', compliancePercent);

        return res;
    }


}