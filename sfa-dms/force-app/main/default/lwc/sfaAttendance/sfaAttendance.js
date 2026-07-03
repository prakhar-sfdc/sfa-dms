import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import handleCheckIn  from '@salesforce/apex/AttendanceLWCController.handleCheckIn';
import handleCheckOut from '@salesforce/apex/AttendanceLWCController.handleCheckOut';
import getTodayAttendance      from '@salesforce/apex/AttendanceLWCController.getTodayAttendance';
import getRecentAttendance    from '@salesforce/apex/AttendanceLWCController.getRecentAttendance';
import getLast7DayCompliance  from '@salesforce/apex/AttendanceLWCController.getLast7DayCompliance';
import getAttendanceLast14Days from '@salesforce/apex/AttendanceLWCController.getAttendanceLast14Days';

export default class SfaAttendance extends LightningElement {

    // ── Clock & GPS ──────────────────────────────────────────────
    @track currentTime = '';
    @track currentDate = '';
    @track gpsCoordinates = 'Fetching location…';
    @track currentAddress = '';
    currentLatitude = null;
    currentLongitude = null;
    locationAccuracy = null;
    timerInterval;

    // ── Check-in state ───────────────────────────────────────────
    @track attendanceStatus = 'Not Checked In';
    @track isCheckedIn = false;
    @track checkInTime = null;
    @track currentDuration = '00:00:00';
    attendanceRecordId = null;
    isSubmitting = false;

    // ── Map ──────────────────────────────────────────────────────
    @track mapMarkers = [];
    @track checkInMapMarkers = [];
    @track checkOutMapMarkers = [];
    @track zoomLevel = 14;
    @track showMap = false;

    // ── Compliance ───────────────────────────────────────────────
    @track weeklyData = [];

    // ── Attendance records ───────────────────────────────────────
    @track recentAttendance = [];
    @track allAttendance = [];
    @track isAttendanceLoading = false;
    @track showAllAttendance = false;

    // ── Attendance modal ─────────────────────────────────────────
    @track showAttendanceModal = false;
    @track selectedAttendance = {};

    connectedCallback() {
        this.updateDateTime();
        this.timerInterval = setInterval(() => { this.updateDateTime(); }, 1000);
        this.initializeMap();
        this.loadTodayAttendance();
        this.getCurrentLocation();
        this.loadRecentAttendance();
        this.loadWeeklyCompliance();
    }

    disconnectedCallback() {
        if (this.timerInterval) clearInterval(this.timerInterval);
    }

    updateDateTime() {
        const now = new Date();
        this.currentDate = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        this.currentTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        if (this.isCheckedIn && this.checkInTime) this.updateCurrentDuration();
    }

    updateCurrentDuration() {
        if (!this.checkInTime) return;
        const diffSecs = Math.floor((new Date() - this.checkInTime) / 1000);
        const h = Math.floor(diffSecs / 3600);
        const m = Math.floor((diffSecs % 3600) / 60);
        const s = diffSecs % 60;
        this.currentDuration = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }

    initializeMap() {
        const def = { location: { Latitude: 19.0760, Longitude: 72.8777 }, title: 'Default Location', description: 'Mumbai, Maharashtra', icon: 'standard:location' };
        this.mapMarkers = [def];
        this.checkInMapMarkers = [{ location: { Latitude: 19.0760, Longitude: 72.8777 }, title: 'Check-In Location', description: 'Office HQ, Mumbai', icon: 'standard:checkin' }];
        this.checkOutMapMarkers = [{ location: { Latitude: 19.0759, Longitude: 72.8778 }, title: 'Check-Out Location', description: 'Client Site', icon: 'standard:logout' }];
    }

    loadTodayAttendance() {
        getTodayAttendance()
            .then(result => {
                if (result) {
                    this.attendanceRecordId = result.Id;
                    this.checkInTime = result.Check_In_Time__c ? new Date(result.Check_In_Time__c) : null;
                    const status = result.Status__c;
                    this.isCheckedIn = status === 'Checked In';
                    this.attendanceStatus = status || 'Not Checked In';
                }
            })
            .catch(error => console.error('Error loading today attendance:', error));
    }

    toggleMap() {
        this.showMap = !this.showMap;
    }

    get mapToggleText() {
        return this.showMap ? 'Hide Map ▲' : 'Show Map ▼';
    }

    getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) { reject('Geolocation not supported'); return; }
            navigator.geolocation.getCurrentPosition(
                position => {
                    this.currentLatitude = position.coords.latitude.toString();
                    this.currentLongitude = position.coords.longitude.toString();
                    this.locationAccuracy = Math.round(position.coords.accuracy);
                    this.gpsCoordinates = `${this.currentLatitude}, ${this.currentLongitude}`;
                    this.reverseGeocode(this.currentLatitude, this.currentLongitude);
                    this.mapMarkers = [{ location: { Latitude: parseFloat(this.currentLatitude), Longitude: parseFloat(this.currentLongitude) }, title: 'My Location', description: 'Current GPS location', icon: 'standard:location' }];
                    resolve(true);
                },
                error => { this.handleLocationError(error); reject(error); },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        });
    }

    reverseGeocode(lat, lng) {
        const locations = [
            { lat: 19.0760, lng: 72.8777, address: 'Mumbai, Maharashtra, India' },
            { lat: 28.7041, lng: 77.1025, address: 'New Delhi, Delhi, India' },
            { lat: 12.9716, lng: 77.5946, address: 'Bangalore, Karnataka, India' },
            { lat: 13.0827, lng: 80.2707, address: 'Chennai, Tamil Nadu, India' }
        ];
        let closest = locations[0];
        let minDist = this.calcDist(lat, lng, closest.lat, closest.lng);
        for (let i = 1; i < locations.length; i++) {
            const d = this.calcDist(lat, lng, locations[i].lat, locations[i].lng);
            if (d < minDist) { minDist = d; closest = locations[i]; }
        }
        this.currentAddress = closest.address;
    }

    calcDist(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    handleLocationError(error) {
        const msgs = { 1: 'Permission denied', 2: 'Position unavailable', 3: 'Request timeout' };
        this.gpsCoordinates = msgs[error.code] || 'Unknown error';
        this.currentAddress = 'Failed to get location';
    }

    async handleCheckInOut() {
        if (this.isSubmitting) return;
        this.isSubmitting = true;
        try {
            await this.getCurrentLocation();
            if (!this.isCheckedIn) {
                const recordId = await handleCheckIn({ lat: this.currentLatitude, lng: this.currentLongitude, address: this.currentAddress });
                this.attendanceRecordId = recordId;
                this.isCheckedIn = true;
                this.attendanceStatus = 'Checked In';
                this.checkInTime = new Date();
                this.dispatchEvent(new ShowToastEvent({ title: 'Success', message: 'Checked in successfully', variant: 'success' }));
            } else {
                await handleCheckOut({ recordId: this.attendanceRecordId, lat: this.currentLatitude, lng: this.currentLongitude, address: this.currentAddress });
                this.isCheckedIn = false;
                this.attendanceStatus = 'Checked Out';
                this.checkInTime = null;
                this.currentDuration = '00:00:00';
                this.dispatchEvent(new ShowToastEvent({ title: 'Success', message: 'Checked out successfully', variant: 'success' }));
            }
            this.loadRecentAttendance();
            this.loadWeeklyCompliance();
        } catch (error) {
            console.error(error);
            this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: 'Unable to capture location. Please try again.', variant: 'error' }));
        } finally {
            this.isSubmitting = false;
        }
    }

    get checkInOutButtonText() { return this.isCheckedIn ? 'Check Out' : 'Check In'; }
    get checkinButtonClass()   { return this.isCheckedIn ? 'checkin-btn checked-in' : 'checkin-btn'; }
    get statusIndicatorClass() {
        if (this.isCheckedIn) return 'status-indicator checked-in';
        if (this.attendanceStatus === 'Checked Out') return 'status-indicator checked-out';
        return 'status-indicator';
    }

    loadRecentAttendance() {
        getRecentAttendance()
            .then(result => {
                this.recentAttendance = result.map(att => this.mapAttendanceRecord(att)).slice(0, 3);
            })
            .catch(error => { console.error('Recent attendance error', error); this.recentAttendance = []; });
    }

    loadWeeklyCompliance() {
        getLast7DayCompliance()
            .then(result => {
                this.weeklyData = result.map((day, index) => ({
                    id: index + 1,
                    label: day.label,
                    value: day.value,
                    onTime: day.onTime,
                    dotClass: day.value >= 90 ? 'compliance-dot on-time' : day.value >= 50 ? 'compliance-dot late' : 'compliance-dot absent'
                }));
            })
            .catch(error => console.error('Weekly compliance error', error));
    }

    viewAllAttendance() {
        this.showAllAttendance = true;
        this.isAttendanceLoading = true;
        getAttendanceLast14Days()
            .then(result => { this.allAttendance = result.map(att => this.mapAttendanceRecord(att)); })
            .catch(error => { console.error('All attendance error', error); this.allAttendance = []; })
            .finally(() => { this.isAttendanceLoading = false; });
    }

    backToRecentAttendance() { this.showAllAttendance = false; }

    mapAttendanceRecord(att) {
        const attDate = att.Attendance_Date__c ? new Date(att.Attendance_Date__c + 'T00:00:00') : null;
        return {
            id: att.Id,
            day: attDate ? attDate.toLocaleDateString('en-IN', { weekday: 'short' }) : '-',
            date: attDate ? attDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '-',
            fullDate: attDate ? attDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : '-',
            checkIn: this.fmtDateTime(att.Check_In_Time__c),
            checkOut: this.fmtDateTime(att.Check_Out_Time__c),
            checkInLocation: att.Check_In_Address__c || '—',
            checkOutLocation: att.Check_Out_Address__c || '—',
            checkInCoords: att.Check_In_Latitude__c && att.Check_In_Longitude__c ? `${att.Check_In_Latitude__c}, ${att.Check_In_Longitude__c}` : '—',
            checkOutCoords: att.Check_Out_Latitude__c && att.Check_Out_Longitude__c ? `${att.Check_Out_Latitude__c}, ${att.Check_Out_Longitude__c}` : '—',
            checkInLat: att.Check_In_Latitude__c,
            checkInLng: att.Check_In_Longitude__c,
            checkOutLat: att.Check_Out_Latitude__c,
            checkOutLng: att.Check_Out_Longitude__c,
            duration: att.Work_Duration__c,
            status: att.Status__c,
            statusClass: att.Status__c === 'Checked In' ? 'status checked-in' : 'status checked-out'
        };
    }

    fmtDateTime(val) {
        if (!val) return '-';
        try { return new Date(val).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }
        catch { return '-'; }
    }

    get weeklyCompliance() {
        if (!this.weeklyData || !this.weeklyData.length) return 0;
        return Math.round(this.weeklyData.reduce((sum, d) => sum + d.value, 0) / this.weeklyData.length);
    }
    get onTimeCount() { return this.weeklyData ? this.weeklyData.filter(d => d.value >= 90).length : 0; }
    get lateCount()   { return this.weeklyData ? this.weeklyData.filter(d => d.value < 90).length : 0; }

    handleEyeClick(event) {
        event.stopPropagation();
        const id = event.currentTarget.dataset.id;
        this.selectedAttendance = this.allAttendance.find(r => r.id === id) || this.recentAttendance.find(r => r.id === id);
        if (this.selectedAttendance) {
            if (this.selectedAttendance.checkInLat && this.selectedAttendance.checkInLng) {
                this.checkInMapMarkers = [{ location: { Latitude: this.selectedAttendance.checkInLat, Longitude: this.selectedAttendance.checkInLng }, title: 'Check-In', description: this.selectedAttendance.checkInLocation, icon: 'standard:checkin' }];
            }
            if (this.selectedAttendance.checkOutLat && this.selectedAttendance.checkOutLng) {
                this.checkOutMapMarkers = [{ location: { Latitude: this.selectedAttendance.checkOutLat, Longitude: this.selectedAttendance.checkOutLng }, title: 'Check-Out', description: this.selectedAttendance.checkOutLocation, icon: 'standard:logout' }];
            }
            this.showAttendanceModal = true;
        }
    }

    closeModal() { this.showAttendanceModal = false; this.selectedAttendance = {}; }
    handleModalClick(event) { event.stopPropagation(); }

    downloadAttendance() {
        if (!this.selectedAttendance?.id) return;
        this.dispatchEvent(new ShowToastEvent({ title: 'Report', message: 'Attendance report downloaded', variant: 'success' }));
    }
}
