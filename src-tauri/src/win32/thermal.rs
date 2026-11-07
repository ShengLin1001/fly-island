//! The hottest ACPI thermal zone, through the performance counters WMI mirrors
//! (`Win32_PerfFormattedData_Counters_ThermalZoneInformation`), which any user may read. On laptops
//! the zones sit by the CPU (the embedded controller's zone follows the package), so this stands
//! in for the CPU temperature; the per-core sensors need a driver and administrator rights.
//!
//! Callers must run on a thread that has entered a COM apartment (see
//! [`super::com::ComApartment`]).

use windows::{
    core::{w, BSTR},
    Win32::System::{
        Com::{
            CoCreateInstance, CoSetProxyBlanket, CLSCTX_INPROC_SERVER, EOAC_NONE, RPC_C_AUTHN_LEVEL_CALL,
            RPC_C_IMP_LEVEL_IMPERSONATE,
        },
        Variant::VARIANT,
        Wmi::{
            IWbemClassObject, IWbemLocator, IWbemServices, WbemLocator, WBEM_FLAG_FORWARD_ONLY,
            WBEM_FLAG_RETURN_IMMEDIATELY, WBEM_GENERIC_FLAG_TYPE,
        },
    },
};

/// RPC_C_AUTHN_WINNT and RPC_C_AUTHZ_NONE, the usual blanket for a local WMI connection.
const AUTHN_WINNT: u32 = 10;
const AUTHZ_NONE: u32 = 0;
/// How long one read may wait for WMI, in milliseconds.
const READ_TIMEOUT_MS: i32 = 1000;
/// Machines list a handful of zones; more are not read.
const MAX_ZONES: usize = 8;

pub(crate) struct ThermalZones(IWbemServices);

impl ThermalZones {
    pub(crate) fn open() -> windows::core::Result<Self> {
        // SAFETY: WbemLocator is a valid class id with no outer object. Every BSTR outlives the
        // call that takes it, and the returned interfaces are owned, reference-counted values.
        unsafe {
            let locator: IWbemLocator = CoCreateInstance(&WbemLocator, None, CLSCTX_INPROC_SERVER)?;
            let empty = BSTR::new();
            let services =
                locator.ConnectServer(&BSTR::from(r"ROOT\CIMV2"), &empty, &empty, &empty, 0, &empty, None)?;
            CoSetProxyBlanket(
                &services,
                AUTHN_WINNT,
                AUTHZ_NONE,
                None,
                RPC_C_AUTHN_LEVEL_CALL,
                RPC_C_IMP_LEVEL_IMPERSONATE,
                None,
                EOAC_NONE,
            )?;
            Ok(Self(services))
        }
    }

    /// The hottest zone in degrees Celsius; `None` when the machine reports no zone.
    pub(crate) fn hottest_celsius(&self) -> Option<f32> {
        let flags = WBEM_GENERIC_FLAG_TYPE(WBEM_FLAG_FORWARD_ONLY.0 | WBEM_FLAG_RETURN_IMMEDIATELY.0);
        let query = BSTR::from("SELECT HighPrecisionTemperature FROM Win32_PerfFormattedData_Counters_ThermalZoneInformation");
        let mut tenths_kelvin = Vec::new();
        // SAFETY: `self.0` is a live connection; the BSTRs outlive the calls, `rows` is a one-slot
        // buffer `Next` fills, `returned` a valid out pointer, and `value` a VARIANT `Get` writes.
        unsafe {
            let found = self.0.ExecQuery(&BSTR::from("WQL"), &query, flags, None).ok()?;
            for _ in 0..MAX_ZONES {
                let mut rows: [Option<IWbemClassObject>; 1] = [None];
                let mut returned = 0u32;
                let _ = found.Next(READ_TIMEOUT_MS, &mut rows, &mut returned);
                let Some(row) = rows[0].take().filter(|_| returned == 1) else { break };
                let mut value = VARIANT::default();
                if row.Get(w!("HighPrecisionTemperature"), 0, &mut value, None, None).is_ok() {
                    tenths_kelvin.extend(u32::try_from(&value).ok());
                }
            }
        }
        hottest(&tenths_kelvin)
    }
}

/// Tenths of a kelvin to degrees Celsius, the hottest plausible zone (firmware reports 0 for an
/// idle sensor).
fn hottest(tenths_kelvin: &[u32]) -> Option<f32> {
    tenths_kelvin
        .iter()
        .map(|&tenths| tenths as f32 / 10.0 - 273.15)
        .filter(|celsius| (1.0..150.0).contains(celsius))
        .max_by(f32::total_cmp)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::win32::com::ComApartment;

    #[test]
    fn zones_read_as_celsius_ignoring_idle_sensors() {
        assert_eq!(hottest(&[3432, 0, 3102]).map(f32::round), Some(70.0));
        assert_eq!(hottest(&[0]), None);
        let _com = ComApartment::multithreaded().unwrap();
        // Desktops may list no zone; either way the read must not fail.
        if let Ok(zones) = ThermalZones::open() {
            assert!(zones.hottest_celsius().is_none_or(|celsius| celsius < 150.0));
        }
    }
}
