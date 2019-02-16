Common = (function () {

    var postUrl = "https://www.posta.com.mk/tnt/api/query?id=";
    var maxRequestTime = 15000;     // 15 seconds max request
    var months = ["Јануари", "Февруари", "Март", "Април", "Мај", "Јуни", "Јули", "Август", "Септември", "Октомври", "Ноември", "Декември"];

    /**
    * Strings used to access the chrome storage.
    */
    var storageStrings = {
        version: "SlediPratki.Version",
        lastRefresh: "SlediPratki.LastRefresh",
        totalNotifications: "SlediPratki.TotalNotifications",
        activeTrackingNumbers: "SlediPratki.ActiveTrackingNumbers",
        archiveTrackingNumbers: "SlediPratki.ArchiveTrackingNumbers",
        autoRefresh: "SlediPratki.Settings.AutoRefresh",
        refreshInterval: "SlediPratki.Settings.RefreshInterval",
        enableNotifications: "SlediPratki.Settings.EnableNotifications",
        maxActivePackages: "SlediPratki.Settings.MaxActivePackages",
        maxArchivePackages: "SlediPratki.Settings.MaxArchivePackages",
        trackingNumbers: "SlediPratki.TrackingNumbers."
    };

    var addZero = function (num) {
        return (num < 10 ? "0" : "") + num;
    }

    /**
    * Format a Date() object to string: "DD Month YYY, HH:MM:SS".
    */
    var formatDate = function (date) {
        if (typeof date === "string") {
            date = new Date(date);
        }

        return addZero(date.getDate()) + " "
            + months[date.getMonth()] + " "
            + date.getFullYear() + ", "
            + addZero(date.getHours()) + ":"
            + addZero(date.getMinutes()) + ":"
            + addZero(date.getSeconds());
    };

    var dateNowJSON = function () {
        return (new Date()).toJSON();
    };

    /**
    * Structure of posta.com.mk XML response
    *    <ArrayOfTrackingData>
    *        <TrackingData>
	*	        <ID>UN232716818CN</ID>
	*	        <Begining>Skopje IO 1003</Begining>
	*	        <End>1020</End>
	*	        <Date>11/5/2018, 1:33:10 PM</Date>
	*	        <Notice>Vo Posta</Notice>
	*        </TrackingData>
    *    </ArrayOfTrackingData>
    */
    var convertXMLToList = function (xmlResult) {
        // if there are no results for some tracking number then the service will return <ArrayOfTrackingData></ArrayOfTrackingData>
        // and the result will stay empty
        var result = [];

        var parser = new DOMParser();
        var xmlDoc = parser.parseFromString(xmlResult, "text/xml");

        var length = xmlDoc.getElementsByTagName("TrackingData").length;

        // look only for Begining, End, Date and Notice tags (those are used by app)
        // i'm using beginning (with two n) in the code
        for (var i = 0; i < length; i++) {
            result.push({
                beginning: xmlDoc.getElementsByTagName("Begining")[i].childNodes[0].nodeValue,
                end: xmlDoc.getElementsByTagName("End")[i].childNodes[0].nodeValue,
                date: xmlDoc.getElementsByTagName("Date")[i].childNodes[0].nodeValue,
                notice: xmlDoc.getElementsByTagName("Notice")[i].childNodes[0].nodeValue
            });
        }

        // returns list of tracking data
        return result;
    };

    /**
    * Format the notice text from posta.com.mk response. 
    */
    var formatNoticeText = function (notice) {
        switch (notice) {
            case "Ispora~ana":
                return "Испорачана";
            case "Vo Posta":
                return "Во пошта";
            case "Pristignata vo Naizmeni!na po{ta(Vlez)":
                return "Пристигната во наизменична пошта";
            case "Za isporaka na {alter":
                return "За испорака на шалтер";
            default:
                return notice;
        }
    };

    /**
    * Formats dates and notice text.
    * Return the package data in this JSON format:
    *    {
    *        trackingNumber: string,
    *        packageDescription: string,
    *        lastRefresh: formatDate(string or Date),
    *        status: string,
    *        notifications: integer,
    *        trackingData: [{
    *            date: formatDate(string or Date)),
    *            beginning: string,
    *            end: string,
    *            notice: formatNoticeText(string)
    *        }]
    *    }
    */
    var formatPackageData = function (packageData) {
        var result = {};

        result.trackingNumber = packageData.trackingNumber;
        result.packageDescription = packageData.packageDescription;
        result.lastRefresh = formatDate(packageData.lastRefresh);
        result.status = packageData.status;
        result.notifications = packageData.notifications;
        result.trackingData = [];

        for (var i = 0; i < packageData.trackingData.length; i++) {
            var dataRow = packageData.trackingData[i];

            result.trackingData.push({
                date: formatDate(dataRow.date),
                beginning: dataRow.beginning,
                end: dataRow.end,
                notice: formatNoticeText(dataRow.notice)
            });
        }

        return result;
    };

    /**
    * Get status of tracking data (read the notice from the last result).
    * 3 possible statuses: 
    * - "clear": no results
    * - "local_shipping": package in transit
    * - "done": package recived
    */
    var getStatusOfTrackingData = function (trackingData) {
        var length = trackingData.length;

        if (length === 0) {
            return "clear";
        } else if (trackingData[length - 1].notice === "Ispora~ana") {
            return "done";
        } else {
            return "local_shipping";
        }
    };

    /**
    * Get data for some package from the posta.com.mk service.
    */
    var getPackage = function (trackingNumber, success, fail) {
        axios({
            method: 'get',
            url: postUrl + trackingNumber,
            timeout: maxRequestTime
        }).then(function (response) {
            var convertedResponse = convertXMLToList(response);
            success(convertedResponse);
        }).catch(function (error) {
            fail("error");
        });
    };

    /**
    * Get from the chrome storage.
    */
    var storageGet = function (keys, callback) {
        chrome.storage.sync.get(keys, callback);
    };

    /**
    * Set to the chrome storage.
    */
    var storageSet = function (keysValues, callback) {
        chrome.storage.sync.set(keysValues, callback);
    };

    /**
    * Remove from the chrome storage.
    */
    var storageRemove = function (keys, callback) {
        chrome.storage.sync.remove(keys, callback);
    };

    /**
    * Add or remove badge with notifications on the extension icon.
    */
    var setBadge = function (notifications) {
        if (notifications < 1) {
            // remove badge
            chrome.browserAction.setBadgeText({ text: "" });
        } else {
            // add badge
            chrome.browserAction.setBadgeBackgroundColor({ color: "#4db6ac" });
            chrome.browserAction.setBadgeText({ text: notifications + "" });
        }
    };

    /**
    * Passed miliseconds from firstDate to secondDate. (secondDate - firstDate)
    */
    var dateDiff = function (firstDate, secondDate) {
        if (typeof firstDate === "string") {
            firstDate = new Date(firstDate);
        }
        if (typeof secondDate === "string") {
            secondDate = new Date(secondDate);
        }

        return secondDate.getTime() - firstDate.getTime();
    };

    /**
    * Refresh the data for all active tracking numbers.
    */
    var refreshActiveTrackingNumbers = function (storage, callback) {
        var activeTrackingNumbers = storage[storageStrings.activeTrackingNumbers];
        var enableNotifications = storage[storageStrings.enableNotifications];
        var totalNotifications = storage[storageStrings.totalNotifications];
        var activeTrackingNumbersLength = activeTrackingNumbers.length;
        var refreshedPackages = 0;
        var newNotifications = 0;

        // get the old results for all tracking numbers
        for (var i = 0; i < activeTrackingNumbersLength; i++) {
            var thisTrackingNumber = storageStrings.trackingNumbers + allActiveTrackingNumbers[i];

            var ajaxCallback = function (newResult) {
                storageGet([thisTrackingNumber], function (oldResult) {

                    var updateOldResult = oldResult[thisTrackingNumber];
                    // update last refresh for this tracking number
                    updateOldResult.lastRefresh = dateNowJSON();

                    // if there is a new result and something new in that result
                    if (newResult !== "error" && newResult.length > updateOldResult.trackingData.length) {
                        // don't update only the trackingNumber and packageDescription for this package! 

                        // update notifications for this tracking number
                        var newLocalNotifications = newResult.length - updateOldResult.trackingData.length;
                        newNotifications += newLocalNotifications;
                        updateOldResult.notifications += newLocalNotifications;

                        // save the new tracking data
                        updateOldResult.trackingData = newResult;

                        // update the status
                        updateOldResult.status = getStatusOfTrackingData(newResult);
                    }

                    // update this tracking number
                    var updateThisTrackingNumber = {};
                    updateThisTrackingNumber[thisTrackingNumber] = updateOldResult;
                    storageSet(updateThisTrackingNumber);

                    refreshedPackages++;

                    if (totalPackages === refreshedPackages) {
                        // in this case all packages are refreshed/synced

                        var updateStorage = {};
                        // update global last refresh
                        updateStorage[storageStrings.lastRefresh] = dateNowJSON();

                        // update total notifications
                        var allNotifications = totalNotifications + newNotifications;
                        updateStorage[storageStrings.totalNotifications] = allNotifications;
                        storageSet(updateStorage);

                        // update the badge
                        setBadge(allNotifications);

                        // show notification window in the right bottom corner if there are new notifications
                        if (enableNotifications && newNotifications > 0) {
                            var suffix = (newNotifications > 1 ? "и" : "а");
                            var options = {
                                type: "basic",
                                title: "Следи Пратки",
                                message: newNotifications + " нов" + suffix + " промен" + suffix + " во пратките.",
                                iconUrl: "../img/icon128.png"
                            };
                            chrome.notifications.create("SlediPratki" + (new Date()).getTime(), options);
                        }

                        // run the outside callback() method if there is one
                        if (callback && (typeof callback === "function")) {
                            callback();
                        }
                    }

                });
            };

            // call the api
            getPackage(thisTrackingNumber, ajaxCallback, ajaxCallback);
        }
    };

    /**
    * Add new package.
    */
    var addNewPackage = function (trackingNumber, packageDescription, callback) {
        var ajaxCallback = function (apiResponse) {
            storageGet([
                storageStrings.activeTrackingNumbers
            ], function (storageResponse) {
                // add this tracking number into active tracking numbers list
                var newActiveTrackingNumbers = storageResponse[storageStrings.activeTrackingNumbers];
                newActiveTrackingNumbers.push(trackingNumber);

                // change api response if error
                if (apiResponse === "error") {
                    apiResponse = [];
                }

                // create the new package
                var newPackage = {};
                newPackage.trackingNumber = trackingNumber;
                newPackage.packageDescription = packageDescription;
                newPackage.lastRefresh = dateNowJSON();
                newPackage.status = getStatusOfTrackingData(apiResponse);
                newPackage.notifications = 0;
                newPackage.trackingData = apiResponse;

                // update active tracking numbers list and add the new package
                var updateStorage = {};
                updateStorage[storageStrings.trackingNumbers + trackingNumber] = newPackage;
                updateStorage[storageStrings.activeTrackingNumbers] = newActiveTrackingNumbers;

                storageSet(updateStorage, function () {
                    // send the new package to the callback method
                    if (callback && (typeof callback === "function")) {
                        callback(newPackage);
                    }
                });
            });
        };

        // call the api
        getPackage(treckingNumber, ajaxCallback, ajaxCallback);
    };

    /**
    * Delete active package.
    */
    var deleteActivePackage = function (trackingNumber, callback) {
        var thisTrackingNumber = storageStrings.trackingNumbers + trackingNumber;

        storageGet([
            storageStrings.activeTrackingNumbers
        ], function (response) {
            var activeTrackingNumbers = response[storageStrings.activeTrackingNumbers];

            // remove tracking number from active
            var removeIndex = activeTrackingNumbers.indexOf(trackingNumber);
            activeTrackingNumbers.splice(removeIndex, 1);

            // save the updated list
            var updateActiveTrackingNumbers = {};
            updateActiveTrackingNumbers[storageStrings.activeTrackingNumbers] = activeTrackingNumbers;

            storageSet(updateActiveTrackingNumbers, function () {
                storageRemove([thisTrackingNumber], callback);
            });
        });
    };

    /**
    * Delete archive package.
    */
    var deleteArchivePackage = function (trackingNumber, callback) {
        var thisTrackingNumber = storageStrings.trackingNumbers + trackingNumber;

        storageGet([
            storageStrings.archiveTrackingNumbers
        ], function (response) {
            var archiveTrackingNumbers = response[storageStrings.archiveTrackingNumbers];

            // remove tracking number from archive
            var removeIndex = archiveTrackingNumbers.indexOf(trackingNumber);
            archiveTrackingNumbers.splice(removeIndex, 1);

            // save the updated list
            var updatearchiveTrackingNumbers = {};
            updatearchiveTrackingNumbers[storageStrings.archiveTrackingNumbers] = archiveTrackingNumbers;

            storageSet(updatearchiveTrackingNumbers, function () {
                storageRemove([thisTrackingNumber], callback);
            });
        });
    };

    /**
    * Change description of package.
    */
    var changePackageDescription = function (trackingNumber, packageDescription, callback) {
        var thisTrackingNumber = storageStrings.trackingNumbers + trackingNumber;

        storageGet([
            thisTrackingNumber
        ], function (response) {
            // update the package description
            var package = response[thisTrackingNumber];
            package.packageDescription = packageDescription;

            // save the package with updated description
            var updatePackage = {};
            updatePackage[thisTrackingNumber] = package;

            storageSet(updatePackage, callback);
        });
    };

    /**
    * Move an active package to archive. 
    */
    var moveActiveToArchive = function (trackingNumber, callback) {
        storageGet([
            storageStrings.activeTrackingNumbers,
            storageStrings.archiveTrackingNumbers
        ], function (response) {
            var activeTrackingNumbers = response[storageStrings.activeTrackingNumbers];
            var archiveTrackingNumbers = response[storageStrings.archiveTrackingNumbers];

            // remove tracking number from active
            var removeIndex = activeTrackingNumbers.indexOf(trackingNumber);
            activeTrackingNumbers.splice(removeIndex, 1);

            // add tracking number in archive
            archiveTrackingNumbers.push(trackingNumber);

            // save the updated lists
            var updateTrackingNumbers = {};
            updateTrackingNumbers[storageStrings.activeTrackingNumbers] = activeTrackingNumbers;
            updateTrackingNumbers[storageStrings.archiveTrackingNumbers] = archiveTrackingNumbers;

            storageSet(updateTrackingNumbers, callback);
        });
    };

    /**
    * Move an archived package to active. 
    */
    var moveArchiveToActive = function (trackingNumber, callback) {
        storageGet([
            storageStrings.activeTrackingNumbers,
            storageStrings.archiveTrackingNumbers
        ], function (response) {
            var activeTrackingNumbers = response[storageStrings.activeTrackingNumbers];
            var archiveTrackingNumbers = response[storageStrings.archiveTrackingNumbers];

            // remove tracking number from archive
            var removeIndex = archiveTrackingNumbers.indexOf(trackingNumber);
            archiveTrackingNumbers.splice(removeIndex, 1);

            // add tracking number in active
            activeTrackingNumbers.push(trackingNumber);

            // save the updated lists
            var updateTrackingNumbers = {};
            updateTrackingNumbers[storageStrings.activeTrackingNumbers] = activeTrackingNumbers;
            updateTrackingNumbers[storageStrings.archiveTrackingNumbers] = archiveTrackingNumbers;

            storageSet(updateTrackingNumbers, callback);
        });
    };

    /**
    * Change settings property for auto refresh. 
    */
    var changeAutoRefresh = function (autoRefresh, callback) {
        var autoRefreshChange = {};
        autoRefreshChange[storageStrings.autoRefresh] = autoRefresh;
        storageSet(autoRefreshChange, callback);
    };

    /**
    * Change settings property for refresh interval. 
    */
    var changeRefreshInterval = function (refreshInterval, callback) {
        var refreshIntervalChange = {};
        refreshIntervalChange[storageStrings.refreshInterval] = refreshInterval;
        storageSet(refreshIntervalChange, callback);
    };

    /**
    * Change settings property for notifications. 
    */
    var changeEnableNotifications = function (enableNotifications, callback) {
        var enableNotificationsChange = {};
        enableNotificationsChange[storageStrings.enableNotifications] = enableNotifications;
        storageSet(enableNotificationsChange, callback);
    };

    /**
    * Remove notifications for some tracking number. 
    */
    var removeNotifications = function (trackingNumber, callback) {
        var thisTrackingNumber = storageStrings.trackingNumbers + trackingNumber;

        storageGet([
            storageStrings.totalNotifications,
            thisTrackingNumber
        ], function (response) {
            // update the notifications for this package
            var package = response[thisTrackingNumber];
            var totalNotifications = response[storageStrings.totalNotifications] - package.notifications;
            package.notifications = 0;

            // update the badge
            setBadge(totalNotifications);

            // save the package with 0 notifications and update total notifications
            var updateStorage = {};
            updateStorage[thisTrackingNumber] = package;
            updateStorage[storageStrings.totalNotifications] = totalNotifications;

            storageSet(updateStorage, callback);
        });
    };

    /**
    * Get all info needed for the app.
    */
    var getAllData = function (callback) {
        storageGet([
            storageStrings.activeTrackingNumbers,
            storageStrings.archiveTrackingNumbers,
            storageStrings.autoRefresh,
            storageStrings.refreshInterval,
            storageStrings.enableNotifications,
            storageStrings.maxActivePackages,
            storageStrings.maxArchivePackages
        ], function (response) {
            var allTrackingNumbers = {};
            var addedTrackingNumbers = 0;
            var activeTrackingNumbers = response[storageStrings.activeTrackingNumbers];
            var archiveTrackingNumbers = response[storageStrings.archiveTrackingNumbers];
            var totalTrackingNumbers = activeTrackingNumbers.length + archiveTrackingNumbers.length;

            // save the results that needed to be returnet to the callback method
            var result = {};
            result[storageStrings.trackingNumbers] = allTrackingNumbers;
            result[storageStrings.activeTrackingNumbers] = activeTrackingNumbers;
            result[storageStrings.archiveTrackingNumbers] = archiveTrackingNumbers;
            result[storageStrings.autoRefresh] = response[storageStrings.autoRefresh];
            result[storageStrings.refreshInterval] = response[storageStrings.refreshInterval];
            result[storageStrings.enableNotifications] = response[storageStrings.enableNotifications];
            result[storageStrings.maxActivePackages] = response[storageStrings.maxActivePackages];
            result[storageStrings.maxArchivePackages] = response[storageStrings.maxArchivePackages];

            // callback function to save all tracking numbers
            var trackingNumberCallback = function (trackingNumber, trackingNumberResponse) {
                // get all info from the storage for this tracking number
                allTrackingNumbers[trackingNumber] = trackingNumberResponse[storageStrings.trackingNumbers + trackingNumber];

                addedTrackingNumbers++;
                if (addedTrackingNumbers === totalTrackingNumbers) {
                    // in this case, this is the last tracking number so update the tracking number list
                    result[storageStrings.trackingNumbers] = allTrackingNumbers;

                    if (callback && (typeof callback === "function")) {
                        callback(result);
                    }
                }
            };

            // get the data for all active tracking numbers 
            for (var i = 0; i < activeTrackingNumbers.length; i++) {
                storageGet([
                    storageStrings.trackingNumbers + activeTrackingNumbers[i]
                ], function (trackingNumberResponse) {
                    trackingNumberCallback(activeTrackingNumbers[i], trackingNumberResponse);
                });
            }

            // get the data for all archive tracking numbers
            for (var i = 0; i < archiveTrackingNumbers.length; i++) {
                storageGet([
                    storageStrings.trackingNumbers + archiveTrackingNumbers[i]
                ], function (trackingNumberResponse) {
                    trackingNumberCallback(archiveTrackingNumbers[i], trackingNumberResponse);
                });
            } 

            // return the result if there are 0 tracking numbers
            if (totalTrackingNumbers == 0 && callback && (typeof callback === "function")) {
                callback(result);
            }
        });
    };

    return {
        storageStrings: storageStrings,
        formatDate: formatDate,
        formatNoticeText: formatNoticeText,
        formatPackageData: formatPackageData,
        getStatusOfTrackingData: getStatusOfTrackingData,
        getPackage: getPackage,
        storageGet: storageGet,
        storageSet: storageSet,
        storageRemove: storageRemove,
        setBadge: setBadge,
        dateDiff: dateDiff,
        refreshActiveTrackingNumbers: refreshActiveTrackingNumbers,
        addNewPackage: addNewPackage,
        deleteActivePackage: deleteActivePackage,
        deleteArchivePackage: deleteArchivePackage,
        changePackageDescription: changePackageDescription,
        moveActiveToArchive: moveActiveToArchive,
        moveArchiveToActive: moveArchiveToActive,
        changeAutoRefresh: changeAutoRefresh,
        changeRefreshInterval: changeRefreshInterval,
        changeEnableNotifications: changeEnableNotifications,
        removeNotifications: removeNotifications,
        getAllData: getAllData
    };
})();